# Phase 5 — AI-driven pet memory (deterministic engine)

## Goal
Make pets feel alive through memory and suggestions — **without** unbounded LLM calls on the request path.

## User stories
- As a player, my pet’s card shows mood, favorite ritual, and a concrete suggestion.
- As a player, care actions leave bounded episodic memories.
- As the system, mind state is derived from verified events + personality (scalable).

## Technical specification
- `src/memory.ts` — `buildPetMind`, favorites, cues, suggestions
- Episodic writes to existing `pet_memories` on care confirm (cap 40/owner)
- Pet JSON gains `mind` + `memories[]`
- No third-party model dependency in v1; prompts are deterministic templates

## Architecture for later LLM assist
- Batch offline jobs can enrich `suggestion` text using stored memories
- Online path stays pure functions + D1

## Testing
- Unit tests for favorites / neglect / playful cues
- Care confirm still covered by API suite

## Next
Wire mind suggestions into world station prompts; optional moderated LLM flavor layer; friends remembered in plaza.
