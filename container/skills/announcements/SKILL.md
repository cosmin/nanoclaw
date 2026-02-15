---
name: announcements
description: Make spoken TTS announcements on speakers throughout the house. Use the voice-pipeline MCP for coordinated announcements with DND support, or ha-mcp for direct speaker control.
allowed-tools: mcp__voice-pipeline__announce, mcp__voice-pipeline__speak_in_room, mcp__voice-pipeline__list_speakers, mcp__home-assistant__ha_call_service, mcp__home-assistant__ha_search_entities, mcp__home-assistant__ha_get_state
---

# TTS Announcements

## Preferred: Voice Pipeline MCP

Use the voice-pipeline MCP tools for announcements. These handle speaker discovery, volume control, and Do Not Disturb automatically.

### Announce to all rooms

`mcp__voice-pipeline__announce` — TTS to all Sonos speakers, automatically skipping DND rooms:

```json
{
  "message": "Dinner is ready",
  "exclude_rooms": ["office"],
  "volume": 0.6
}
```

- `message` (required): The text to announce
- `exclude_rooms` (optional): Room names to skip
- `volume` (optional): Volume level 0.0-1.0 (defaults to config)

### Speak in a specific room

`mcp__voice-pipeline__speak_in_room` — TTS to one room's speaker:

```json
{
  "message": "Time to check the oven",
  "room": "kitchen",
  "volume": 0.5
}
```

### Discover available speakers

`mcp__voice-pipeline__list_speakers` — Shows all rooms with speakers and their DND status. Call this first if you need to know which rooms are available.

## Fallback: Direct HA Control via ha-mcp

For direct speaker control (e.g., playing media, adjusting EQ, or targeting speakers not in the voice pipeline config), use ha-mcp directly:

### Setting volume

```json
{
  "domain": "media_player",
  "service": "volume_set",
  "entity_id": "media_player.kitchen_speaker",
  "data": {
    "volume_level": 0.6
  }
}
```

### Direct TTS via ha-mcp

```json
{
  "domain": "tts",
  "service": "speak",
  "entity_id": "tts.google_en_com",
  "data": {
    "media_player_entity_id": "media_player.kitchen_speaker",
    "message": "Time to check the oven"
  }
}
```

### Discovering speakers

Find available media players with `mcp__home-assistant__ha_search_entities`:

```json
{
  "search_query": "media player",
  "entity_type": "media_player"
}
```

## Guidelines

- **Prefer voice-pipeline tools** for announcements — they respect DND schedules and auto-discover speakers.
- **Use ha-mcp directly** only when you need fine-grained control (specific speaker groups, non-TTS media, etc.).
- Keep messages concise and natural-sounding.
- When a voice request came from a specific room (check the message context), use `speak_in_room` to respond to that room.
- For house-wide announcements, use `announce` — it handles DND automatically.
