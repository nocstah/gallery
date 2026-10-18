import { isHttpError } from '@immich/sdk';
import { toastManager } from '@immich/ui';

export function getServerErrorMessage(error: unknown) {
  if (!isHttpError(error)) {
    return;
  }

  // errors for endpoints without return types aren't parsed as json
  let data = error.data;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      // Not a JSON string
    }
  }

  if (Array.isArray(data?.errors) && data.errors.length > 0) {
    const details = data.errors
      .map(({ path, message }) => {
        const field = path
          .map((segment, i) => (typeof segment === 'number' ? `[${segment}]` : i === 0 ? segment : `.${segment}`))
          .join('');
        return field ? `${field}: ${message}` : message;
      })
      .join(', ');
    return `${data.message}: ${details}`;
  }

  return data?.message || error.message;
}

export function standardizeError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

// Local Omarchy layer: a failure says what failed in the page's own words (the caller's translated message), with the
// server's reason under it only when that adds something: not its status alone ("Error: 500", "Bad Request"), nor the
// same words again. Upstream showed the server's raw message cut at 75 characters, "(Immich Server Error)" under it,
// in English whatever the language, where the build's branding never reached.
const DETAIL_LENGTH = 140;
const comparable = (text: string) =>
  text
    .toLowerCase()
    .replace(/[\s.!:…]+$/u, '')
    .trim();

/** The server's reason for a failure, when it says more than the localized message and the status do. */
export function serverDetail(error: unknown, localizedMessage: string): string | undefined {
  const said: unknown = getServerErrorMessage(error);
  const message = (Array.isArray(said) ? said.join(', ') : typeof said === 'string' ? said : '').trim();
  // the status in words, as the server names it beside its message ("Bad Request", "Not Found")
  const statusWords = isHttpError(error) && typeof error.data?.error === 'string' ? error.data.error : '';
  const repeats = [localizedMessage, statusWords, 'internal server error'].some(
    (words) => words && comparable(message) === comparable(words),
  );
  if (!message || repeats || /^error:?\s*\d{3}$/i.test(message)) {
    return;
  }
  return message.length > DETAIL_LENGTH ? `${message.slice(0, DETAIL_LENGTH - 1).trimEnd()}…` : message;
}

export function handleError(error: unknown, localizedMessage: string, options?: { notify?: boolean }) {
  const { notify = true } = options ?? {};
  const standardizedError = standardizeError(error);
  if (standardizedError.name === 'AbortError') {
    return;
  }

  console.error(`[handleError]: ${standardizedError}`, error, standardizedError.stack);

  try {
    // Local Omarchy layer: the toast leads with the localized message (its title where the server's reason follows as
    // the line under it); the same words come back, the reason on a line of its own
    const detail = serverDetail(error, localizedMessage);

    if (notify) {
      toastManager.danger(detail ? { title: localizedMessage, description: detail } : localizedMessage);
    }

    return detail ? `${localizedMessage}\n${detail}` : localizedMessage;
  } catch (error) {
    console.error(error);
    return localizedMessage;
  }
}

export async function handleErrorAsync<T>(fn: () => Promise<T>, localizedMessage: string): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error: unknown) {
    handleError(error, localizedMessage);
    return;
  }
}
