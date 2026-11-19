<script lang="ts">
  import RoomPlayer from '#lib/components/room/RoomPlayer.svelte';
  import { roomRequest } from '#lib/components/room/room-reels.ts';
  import { page } from '$app/state';

  // Local Omarchy layer: Room, the archive across the room, full screen without the shell (DESIGN.md, Room): today's
  // films, /room?album= one album, /room?year= one year. Another address is another Room.
</script>

{#key page.url.search}
  <RoomPlayer request={roomRequest(page.url.searchParams)} />
{/key}
