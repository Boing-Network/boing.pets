# Phase 3 — Party invites foundation

## Goal

Let friends form a party of up to 4 with signed create / invite / accept / leave.

## Rules

- Friends only for invites
- Leader invites; max 4 members
- One party membership per wallet
- Leader leave promotes oldest remaining member (or disbands)

## APIs

- `GET /api/social/party?owner=`
- `GET /api/social/party/invites?owner=`
- Social challenge kinds: `party_create`, `party_invite`, `party_accept`, `party_decline`, `party_leave`

## Migration

`migrations/0012_parties.sql`

## Still open

Plaza party markers, shared activity bonuses, party chat
