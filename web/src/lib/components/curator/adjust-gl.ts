// Local Omarchy layer: the Adjust panel's live preview (AdjustPhoto.svelte). The photo's preview goes to the GPU once;
// each change of a slider sends only the small colour table lutData builds (adjust-math.ts), which the GPU reads
// between its points, then the straightened frame and the vignette, all as Curator renders the kept photo
// (~/code/curator/curator/adjust.py). WebGL2: the table is a 3D texture in half floats, which keeps the values a
// stretched colour takes past 0..1 until after it is read; the photo is mipmapped, so a photo shrunk or turned on
// screen does not shimmer.

const VERTEX = `#version 300 es
out vec2 place;
void main() {
  // one triangle over the whole canvas; place runs 0..1 across and down the frame
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  place = vec2(corner.x, 1.0 - corner.y);
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
precision highp sampler3D;
uniform sampler2D photo;
uniform sampler3D table;
// a place in the frame (0..1 across and down, 1) to the place in the photo it shows (adjust-math.ts sourceMatrix)
uniform mat3 frame;
// the table's points a side
uniform float points;
// VIGNETTE times the slider: above zero the corners darken, below they lighten
uniform float vignette;
uniform bool original;
in vec2 place;
out vec4 colour;
void main() {
  vec3 c = texture(photo, (frame * vec3(place, 1.0)).xy).rgb;
  if (!original) {
    c = clamp(texture(table, c * ((points - 1.0) / points) + 0.5 / points).rgb, 0.0, 1.0);
    vec2 d = 2.0 * place - 1.0;
    float weight = smoothstep(0.3, 1.0, sqrt(dot(d, d) / 2.0));
    c = vignette > 0.0 ? c * max(0.0, 1.0 - vignette * weight) : c + (1.0 - c) * min(1.0, -vignette * weight);
  }
  colour = vec4(c, 1.0);
}`;

const IDENTITY = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

export type Draw = {
  /** sourceMatrix for the straightened frame */
  frame: Float32Array;
  /** VIGNETTE times the slider */
  vignette: number;
  /** the photo as it was: all of it, no colour steps */
  original: boolean;
};

export class AdjustPreview {
  readonly maxSize: number;
  #gl: WebGL2RenderingContext;
  #program: WebGLProgram;
  #photo: WebGLTexture;
  #table: WebGLTexture;
  #points = 0;
  #uniforms: Record<'photo' | 'table' | 'frame' | 'points' | 'vignette' | 'original', WebGLUniformLocation | null>;

  /** throws when the browser has no WebGL2 */
  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
    });
    if (!gl) {
      throw new Error('WebGL2 is not available');
    }
    this.#gl = gl;
    this.maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    this.#program = this.#link();
    this.#uniforms = {
      photo: gl.getUniformLocation(this.#program, 'photo'),
      table: gl.getUniformLocation(this.#program, 'table'),
      frame: gl.getUniformLocation(this.#program, 'frame'),
      points: gl.getUniformLocation(this.#program, 'points'),
      vignette: gl.getUniformLocation(this.#program, 'vignette'),
      original: gl.getUniformLocation(this.#program, 'original'),
    };
    this.#photo = this.#texture(gl.TEXTURE_2D, gl.LINEAR_MIPMAP_LINEAR);
    this.#table = this.#texture(gl.TEXTURE_3D, gl.LINEAR);
  }

  #compile(type: number, source: string) {
    const gl = this.#gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) ?? 'the preview shader does not compile');
    }
    return shader;
  }

  #link() {
    const gl = this.#gl;
    const program = gl.createProgram();
    gl.attachShader(program, this.#compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, this.#compile(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? 'the preview shader does not link');
    }
    return program;
  }

  #texture(target: number, minify: number) {
    const gl = this.#gl;
    const texture = gl.createTexture();
    gl.bindTexture(target, texture);
    gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, minify);
    gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (target === gl.TEXTURE_3D) {
      gl.texParameteri(target, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    }
    return texture;
  }

  /** The photo, its pixels taken as they are: the caller drew it into an sRGB canvas, which converted its colours
   * from the profile it carries, as Curator converts the full-size photo. */
  photo(source: HTMLCanvasElement) {
    const gl = this.#gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.#photo);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  /** the colour table: `points` a side, four floats a point (lutData) */
  table(data: Float32Array, points: number) {
    const gl = this.#gl;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, this.#table);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, points, points, points, 0, gl.RGBA, gl.FLOAT, data);
    this.#points = points;
  }

  draw({ frame, vignette, original }: Draw) {
    const gl = this.#gl;
    if (this.#points === 0 || gl.isContextLost()) {
      return;
    }
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.useProgram(this.#program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.#photo);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, this.#table);
    gl.uniform1i(this.#uniforms.photo, 0);
    gl.uniform1i(this.#uniforms.table, 1);
    gl.uniformMatrix3fv(this.#uniforms.frame, false, original ? IDENTITY : frame);
    gl.uniform1f(this.#uniforms.points, this.#points);
    gl.uniform1f(this.#uniforms.vignette, vignette);
    gl.uniform1i(this.#uniforms.original, original ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** gives the GPU memory back at once instead of when the canvas is collected */
  destroy() {
    const gl = this.#gl;
    gl.deleteTexture(this.#photo);
    gl.deleteTexture(this.#table);
    gl.deleteProgram(this.#program);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
