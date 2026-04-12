# D&D 5e Rules Reference

Focused reference for GM use. Level 1-4 party scope.

---

## Action Economy

Each turn a creature gets:
- **1 Action**
- **1 Bonus Action** (only if a feature/spell grants one)
- **1 Reaction** (resets at start of your turn)
- **Movement** up to speed (30 ft default, split around actions)

### Actions in Combat

| Action | Description |
|--------|-------------|
| **Attack** | Make one weapon attack (or more with Extra Attack at level 5+) |
| **Cast a Spell** | Cast a spell with casting time of 1 action |
| **Dash** | Double movement this turn |
| **Disengage** | Movement doesn't provoke opportunity attacks this turn |
| **Dodge** | Attackers have disadvantage on you; DEX saves at advantage. Loses effect if incapacitated or speed = 0 |
| **Help** | Give ally advantage on next ability check or attack vs target you threaten |
| **Hide** | Make Stealth check — if beat passive Perception of creatures, become hidden |
| **Ready** | Declare trigger + action. Use reaction to execute when trigger occurs. Concentration spells: hold concentration |
| **Search** | Perception or Investigation check |
| **Use Object** | Interact with object requiring your action |
| **Grapple** | Athletics vs target's Athletics or Acrobatics (their choice). Target becomes Grappled |
| **Shove** | Athletics vs Athletics/Acrobatics. Push 5 ft or knock prone |

**Free object interaction:** Once per turn, minor interaction (draw sword, open unlocked door) is free.

### Bonus Actions

Only usable when a specific feature/spell says "as a bonus action":
- **Offhand attack** — if you took the Attack action with a light weapon and hold a light weapon in the other hand (no ability modifier to damage unless negative)
- **Spells** with bonus action casting time (Healing Word, Hex)
- **Cunning Action** (Rogue), **Flurry of Blows** (Monk), etc.

**Rule:** You can't cast a spell as your action AND a non-cantrip as bonus action in the same turn. Cantrip action + bonus spell OK. Bonus spell + cantrip action OK.

### Reactions

- **Opportunity Attack** — when creature you can see leaves your reach; use reaction to make one melee attack
- **Shield** spell (if known)
- **Readied action** trigger

---

## Ability Checks

**Roll:** d20 + ability modifier (+ proficiency bonus if proficient)

**Skills by ability:**

| STR | DEX | CON | INT | WIS | CHA |
|-----|-----|-----|-----|-----|-----|
| Athletics | Acrobatics | — | Arcana | Animal Handling | Deception |
| | Sleight of Hand | | History | Insight | Intimidation |
| | Stealth | | Investigation | Medicine | Performance |
| | | | Nature | Perception | Persuasion |
| | | | Religion | Survival | |

**Passive Score** = 10 + ability modifier (+ proficiency). Used when not actively searching.
- Passive Perception detects hidden creatures/traps without rolling

**Contests:** Both parties roll, higher wins. Ties go to the initiating party failing (or status quo holds).

**Proficiency Bonus by level:** 1-4 = +2 | 5-8 = +3 | 9-12 = +4

---

## Outcome Tiers (House Rule)

| Outcome | Condition |
|---------|-----------|
| Critical Fail | Natural 1 on d20 |
| Fail | Total below DC |
| Partial | Total within 4 of DC (DC-4 to DC-1) |
| Success | Total ≥ DC |
| Critical | Natural 20 on d20 |

---

## Saving Throws

Six saving throws, one per ability. Proficiency if trained.

**Common saves triggered by:**
- STR: being moved or restrained against will
- DEX: area effects (Fireball, Thunderwave), traps
- CON: maintaining concentration, poison, exhaustion
- INT: rare — some enchantment effects
- WIS: charm, fear, illusions, psychic
- CHA: banishment, possession

---

## Combat Flow

**Round = 6 seconds. All creatures act once.**

1. **Surprise** (if applicable) — Stealth vs Passive Perception; surprised = no action/reaction on first turn
2. **Initiative** — Everyone rolls d20 + DEX mod simultaneously; order descending
3. **Turns** — action, bonus action, movement, reaction (as triggered)
4. **End of round** — durations tick, concentration checked if needed

### Attack Rolls

`d20 + attack bonus vs target AC`

- **Attack bonus** = ability mod + proficiency (if proficient with weapon)
  - Melee: STR mod (or DEX if finesse)
  - Ranged: DEX mod
  - Spell attack: Spellcasting ability mod + proficiency

- **Hit** → roll damage
- **Miss** → describe the miss
- **Critical Hit** (nat 20) → roll damage dice twice (not modifiers), add modifiers once

### Damage

`damage dice + ability modifier`

- Two-handed weapon: STR
- Offhand (light): no ability modifier (unless negative)
- Spell damage: no modifier added (unless feature specifies)

### Critical Hits

Roll damage dice twice, add modifier once:
- Rapier 1d8+2 → crit = 2d8+2
- Eldritch Blast 1d10+CHA → crit = 2d10+CHA

---

## Conditions

| Condition | Key Effects |
|-----------|-------------|
| **Blinded** | Auto-fail sight checks; attack rolls against = advantage; your attacks = disadvantage |
| **Charmed** | Can't attack charmer; charmer has advantage on social checks vs you |
| **Deafened** | Auto-fail hearing checks |
| **Frightened** | Disadvantage on checks/attacks while source in line of sight; can't move closer voluntarily |
| **Grappled** | Speed = 0. Ends if grappler incapacitated or you are moved out of reach |
| **Incapacitated** | No actions or reactions |
| **Invisible** | Can't be seen normally; attack rolls against = disadvantage; your attacks = advantage |
| **Paralyzed** | Incapacitated + can't move/speak; attacks against = advantage; hits within 5 ft = auto-crit |
| **Petrified** | Turned to stone; incapacitated, resistance to all damage, immune to poison/disease |
| **Poisoned** | Disadvantage on attack rolls and ability checks |
| **Prone** | Can only crawl (half speed); attacks against = advantage if within 5 ft, disadvantage if ranged; your attacks = disadvantage |
| **Restrained** | Speed = 0; attacks against = advantage; your attacks = disadvantage; DEX saves at disadvantage |
| **Stunned** | Incapacitated; auto-fail STR/DEX saves; attacks against = advantage |
| **Unconscious** | Incapacitated + prone + drop anything held; attacks against = advantage; hits within 5 ft = auto-crit |
| **Exhaustion** | Level 1-6 stack. Level 1 = disadvantage on checks; 2 = half speed; 3 = disadvantage attacks/saves; 4 = max HP halved; 5 = speed 0; 6 = death |

---

## Spellcasting

### Components
- **V** (Verbal) — must be able to speak
- **S** (Somatic) — must have at least one free hand
- **M** (Material) — need component or arcane/holy focus

### Spell Slots

Expend a slot to cast a leveled spell. Casting at higher level uses a higher slot (often stronger).

Spell save DC = 8 + proficiency + spellcasting ability mod
Spell attack = proficiency + spellcasting ability mod

### Concentration

- Only one concentration spell at a time
- Casting another concentration spell ends the first
- Taking damage → **CON save DC = max(10, half damage)** or concentration breaks
- Incapacitated = concentration broken

### Ritual Casting

Some spells have ritual tag. Cast without spending a slot — takes 10 extra minutes. Must have ritual in spellbook (Wizard) or always have it prepared (Cleric with domain).

### Cantrips

No spell slot, unlimited use. Scale by character level (not spell slot):
- Level 1-4: base damage
- Level 5-10: +1 die
- Level 11-16: +2 dice
- Level 17-20: +3 dice

---

## Class Reference — Active Characters

### Dekcams Dog — Cleric (Knowledge Domain) Level 1

**Spellcasting ability:** WIS (+2 mod) | Spell save DC: 12 | Spell attack: +4
**Slots:** 2 × 1st level | **Recharge:** Long rest

**Cantrips (unlimited):**
- **Sacred Flame** — DEX save (DC 12) or 1d8 radiant. No cover bonus. Range 60 ft.
- **Guidance** — Touch. Concentration. Target adds 1d4 to one ability check before spell ends.
- **Thaumaturgy** — Minor magical effects (voice, flames, tremors, eyes, doors). 1 min duration.

**Domain Spells (always prepared):**
- **Command** (1st) — WIS save or follow 1-word command (drop, flee, grovel, halt, approach). 1 action, 60 ft.
- **Identify** (1st, ritual) — Learn properties of magic item or ongoing spell. 1 minute cast (or 11 as ritual, no slot).

**Spells Prepared (can swap on long rest):**
- **Cure Wounds** (1st) — Touch. Restore 1d8+2 HP. Not on unconscious 0-HP (use Healing Word).
- **Bless** (1st, concentration) — Up to 3 creatures add 1d4 to attack rolls and saving throws. 1 min.
- **Shield of Faith** (1st, concentration) — +2 AC to target. 10 min.

**Domain Feature — Blessings of Knowledge:** Expertise (double proficiency) in History and Arcana.

**Ritual casting:** Can ritual-cast Identify without expending a slot.

---

### Celine — Warlock (Great Old One) Level 1

**Spellcasting ability:** CHA (+2 mod) | Spell save DC: 12 | Spell attack: +4
**Pact Magic:** 1 × 1st level slot | **Recharge: Short rest or long rest**

**Cantrips (unlimited):**
- **Eldritch Blast** — 1d10 force damage, range 120 ft, spell attack roll. Scales to 2 beams at level 5.
- **Minor Illusion** — Create sound or image in 30 ft. INT Investigation vs DC 12 to disbelieve.

**Spells Known (cannot swap without leveling):**
- **Hex** (1st, concentration, bonus action) — Curse target: extra 1d6 necrotic on each hit. Target has disadvantage on chosen ability check. 1 hour. If target dies, can move hex as bonus action.
- **Dissonant Whispers** (1st) — WIS save or 3d6 psychic + must use reaction to flee. On save: half damage, no flee.

**Patron Feature — Awakened Mind:** Telepathically communicate with any creature within 30 ft (one-way). No shared language needed.

**Important:** Celine's ONE slot recharges on SHORT rest. After a short rest she's fully operational again.

---

## Cover

| Cover | AC Bonus | DEX Save Bonus |
|-------|----------|----------------|
| Half (low wall, furniture) | +2 | +2 |
| Three-quarters (portcullis, thick tree) | +5 | +5 |
| Full | Can't be targeted directly | — |

---

## Grappling & Shoving

**Grapple:** Attack action → STR (Athletics) vs target's STR (Athletics) or DEX (Acrobatics). Success = Grappled condition. Drag grappled creature: move at half speed.

**Shove:** Attack action → STR (Athletics) vs STR (Athletics) or DEX (Acrobatics). Choose: push 5 ft away OR knock prone.

**Escape grapple:** Action → STR (Athletics) or DEX (Acrobatics) vs grappler's STR (Athletics).

---

## Vision & Light

- **Bright light:** Normal vision
- **Dim light (shadows):** Lightly obscured — disadvantage on Perception checks relying on sight
- **Darkness:** Heavily obscured — effectively blind (disadvantage attacks, advantage against you) unless Darkvision

**Darkvision:** See in darkness as dim light (no color). See in dim light as bright light. Range varies by race.

**Invisible attacker:** Attacks against you at disadvantage; your attacks against it at advantage. Still make noise/leave tracks.

---

## Death & Dying

**At 0 HP:** Drop unconscious. Start making death saving throws.

**Death saving throw:** d20 at start of your turn. No modifier.
- 10 or higher = 1 success
- 9 or lower = 1 failure
- Nat 20 = regain 1 HP (conscious, prone)
- Nat 1 = 2 failures
- 3 successes = stable (unconscious but not dying)
- 3 failures = dead

**Taking damage at 0 HP:** 1 failure. Critical hit at 0 HP = 2 failures.

**Stabilizing:** Medicine check DC 10 (action), or any healing spell/potion.

**Regaining consciousness:** After stabilizing, regain 1d4 HP after 1d4 hours. Or any healing.

---

## Rests

### Short Rest (1 hour)
- Spend Hit Dice: roll 1d8 (Cleric/Warlock/Bard) + CON mod, regain that HP. Have (level) Hit Dice, recover half on long rest.
- **Warlock:** Pact magic slot fully restores.
- **Bard:** Bardic Inspiration restores (CHA mod uses).

### Long Rest (8 hours, max 1/day)
- Regain all HP
- Regain all spell slots
- Regain all Hit Dice up to half max (rounded up)
- All short-rest benefits included

---

## Resting in Dangerous Areas

Short rest: requires no strenuous activity for 1 hour — possible in most situations.
Long rest: requires light activity only; if interrupted by combat/spells/strenuous activity (1 hour+), must restart.

---

## Carrying Capacity & Encumbrance (simplified)

Carrying capacity = STR score × 15 lbs. Encumbrance rules optional — typically ignored in theater-of-mind play.

---

## Inspiration

GM can award Inspiration for great roleplay, clever thinking, or embodying character traits. Player can spend Inspiration to get advantage on any roll. Can't stack — either have it or you don't.

---

## Common DC Table

| Task | DC |
|------|----|
| Trivial | 5 |
| Easy | 10 |
| Medium | 15 |
| Hard | 20 |
| Very Hard | 25 |
| Nearly Impossible | 30 |

---

## Wealth

| Coin | Value |
|------|-------|
| CP (copper) | 1/100 GP |
| SP (silver) | 1/10 GP |
| EP (electrum) | 1/2 GP |
| GP (gold) | 1 GP |
| PP (platinum) | 10 GP |

---

## Common Weapons (Party Relevant)

| Weapon | Dmg | Type | Properties |
|--------|-----|------|------------|
| Mace | 1d6 | Bludgeoning | — |
| Rapier | 1d8 | Piercing | Finesse |
| Dagger | 1d4 | Piercing | Finesse, light, thrown (20/60) |
| Light crossbow | 1d8 | Piercing | Ammunition, loading, range (80/320), two-handed |

**Finesse:** Use STR or DEX for attack and damage (must use same for both).
**Loading:** Can only fire once per action regardless of attacks.
**Thrown:** Can hurl at listed range. STR for attack/damage.

---

## Armor (Party Relevant)

| Armor | AC | Max DEX | Stealth |
|-------|----|---------|---------|
| Leather | 11 + DEX | — | — |
| Chain Mail | 16 | — | Disadvantage |

**Shield:** +2 AC. Requires one hand.
