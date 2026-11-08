# Phase 6 — Cooking

## Goal
Fourth activity loop: cook recipes from crops and fish, then serve snacks for hunger/energy care boosts.

## Loop
1. Sign `cook` with `{ recipe_id }` (ingredients deducted from inventory)
2. Receive dish inventory + Boinglets + cookbook collection unlock
3. Sign `serve` with `{ food_id }` (dish consumed, snack logged)
4. Pet vitals apply hunger/energy boosts from today’s servings

## Caps
- 5 cooks / UTC day
- 5 serves / UTC day

## Recipes
| Recipe | Ingredients | Dish | Boosts |
| --- | --- | --- | --- |
| Sprout Salad | crop-sprout | food-sprout-salad | hunger +15 |
| Berry Glaze Fish | crop-berry + fish-ripple | food-berry-glaze | hunger +25, energy +10 |
| Moon Feast | crop-moonbloom + fish-moonkoi | food-moon-feast | hunger +40, energy +20 |

## Migration
`migrations/0014_cooking.sql`

## World hook
Starter Town `station-kitchen` → `/kitchen.html`
