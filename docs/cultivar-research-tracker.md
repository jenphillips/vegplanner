# Cultivar Research Tracker

Tracks progress on populating `data/cultivar-library.json` with named varieties.
See `docs/cultivar-library-scaling.md` for the overall strategy.

## Status

| Crop Group | Target | Completed | Status | Notes |
|---|---|---|---|---|
| Tomatoes | 25-30 | 31 | done | Includes ported varieties + Robin series (container) |
| Peppers | 15-20 | 17 | done | Complete; Jalapeño Early and Shishito added as new entries |
| Beans | 10-12 | 11 | done | 8 bush + 3 pole/runner varieties |
| Lettuce | 10-12 | 11 | done | 3 romaine, 3 butterhead, 3 loose leaf, 2 batavian |
| Squash | 10-12 | 11 | done | 5 summer (zucchini, crookneck, pattypan) + 6 winter (butternut, delicata, acorn, spaghetti, kuri, pumpkin) |
| Cucumbers | 6-8 | 9 | done | 5 slicing + 3 pickling + cucamelon |
| Peas | 6-8 | 8 | done | 3 shelling (Spring, Green Arrow, Lincoln) + 3 sugar snap (Sugar Snap, Sugar Ann, Super Sugar Snap) + 2 snow (Oregon Sugar Pod II, Mammoth Melting Sugar) |
| Carrots | 4-5 | 5 | done | Tendersweet ported + Scarlet Nantes, Bolero (Nantes), Danvers 126, Chantenay Red Core |
| Beets | 4-5 | 5 | done | Avalanche ported + Detroit Dark Red, Chioggia, Golden, Cylindra |
| Radishes | 4-5 | 5 | done | 3 spring (Cherry Belle, French Breakfast, Easter Egg) + 2 winter (Watermelon, Miyashige White daikon) |
| Turnips/Rutabagas/Parsnips | 3-4 | 5 | done | Purple Top White Globe + Tokyo Cross turnip, American Purple Top rutabaga, Hollow Crown + Harris Model parsnip |
| Spinach | 4-5 | 5 | done | Seaside ported; Bloomsdale, Space, Tyee, Giant Winter added |
| Greens | 10-12 | 14 | done | Mustard, bok choy, mizuna, mâche, miner's lettuce, NZ spinach, arugula, callaloo |
| Alliums | 8-10 | 12 | done | Frontier + Walla Walla + Red Wing onion, Ambition + Conservor + Zebrune shallot, Music (hardneck) + Inchelium Red (softneck) garlic, King Richard + Bandit (overwintering) leek, Evergreen Hardy White + Red Beard scallion |
| Herbs | ~30 | 34 | done | 5 basil (Genovese, Thai, Dark Opal, Lemon, Cinnamon) + 2 each cilantro, parsley, dill, thyme, oregano, sage, rosemary, mint, chives + tarragon, marjoram, summer & winter savory, lemon balm, chamomile, chervil, sorrel, shiso, lemongrass, stevia |
| Brassicas | 8-10 | 15 | done | Gai lan ported + Calabrese + Waltham 29 broccoli, Snowball Self-Blanching + Graffiti cauliflower, Golden Acre + Red Acre cabbage, Long Island Improved + Catskill Brussels sprouts, Lacinato + Winterbor + Red Russian + Dwarf Blue Curled Scotch kale, Early White Vienna kohlrabi, Veronica romanesco |
| Eggplant/Tomatillo/Ground Cherry | — | 8 | done | Black Beauty + Ichiban + Little Fingers + Fairy Tale + Patio Baby eggplant, Toma Verde + Purple tomatillo, Aunt Molly's ground cherry |
| Melons | — | 5 | done | Sugar Baby + Crimson Sweet watermelon, Hale's Best Jumbo + Minnesota Midget cantaloupe, Green Flesh honeydew |
| Perennials/Other | — | 7 | done | Asparagus, strawberry ported; Good King Henry, lovage, horseradish, rhubarb (Victoria + Canada Red) added |
| Flowers | — | 2 | done | Benary's Giant zinnia, Double Click cosmos ported |
| Swiss Chard | 3-4 | 4 | done | Bright Lights, Fordhook Giant, Ruby Red, Peppermint |
| Potatoes | 4-6 | 5 | done | 3 early (Yukon Gold, Red Pontiac, Red Norland) + 1 mid (Kennebec) + 1 late (Russet Burbank). Planted from tubers |
| Corn (Sweet) | 3-4 | 3 | done | Peaches and Cream, Golden Bantam, Silver Queen |
| Sweet Potatoes | 2-3 | 3 | done | Beauregard, Covington, Georgia Jet. Grown from slips |
| Collard Greens | 2-3 | 3 | done | Georgia Southern, Vates, Champion |
| Okra | 2-3 | 2 | done | Clemson Spineless, Burgundy |
| Celery/Celeriac | 2-3 | 3 | done | Tall Utah 52-70 + Tango celery, Brilliant celeriac |
| Fennel (Bulbing) | 1-2 | 2 | done | Orion, Finale |
| Broccoli (Sprouting)/Broccolini | 2-3 | 3 | done | Purple Sprouting + Early Purple Sprouting, Aspabroc broccolini |

**Total target: ~200 varieties**
**Completed: 248** (231 new + 17 ported from vegplanner.json)

## Varieties ported from vegplanner.json (now in cultivar-library.json)

- Tomato: San Marzano, Sweet Million, Cherry Falls
- Beet: Avalanche
- Bean (Bush): Provider
- Lettuce (Romaine): Little Gem
- Spinach: Seaside
- Gai Lan: Green Pearl
- Carrot: Tendersweet
- Cucumber (Slicing): Tendergreen Burpless
- Onion (Bulbing): Frontier
- Shallot: Ambition
- Pea (Shelling): Spring
- Asparagus: Guelph Millennium
- Strawberry: Cavendish
- Zinnia: Benary's Giant Mix (flower)
- Cosmos: Double Click Mix (flower)

## Data quality approach

- Generated from AI training knowledge (general horticultural data)
- Not verified against live seed catalog pages
- User spot-checks against physical catalogs
- For missing fields, baseline-cultivars.json provides crop-level fallback values
