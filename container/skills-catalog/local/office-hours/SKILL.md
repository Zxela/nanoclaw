---
name: office-hours
description: YC-style product dialogue for startup ideas and builder projects. Use when asked to "brainstorm this", "I have an idea", "help me think through this", "office hours", "is this worth building", "think through my product", or when the user describes a new product idea unprompted.
categories: ["general"]
---

# Office Hours

A product dialogue skill modeled on YC-style office hours. Runs in two modes:

- **Startup mode** — interrogative. Exposes demand reality through forcing questions. For founders or anyone evaluating whether something is worth building seriously.
- **Builder mode** — generative. Design thinking for side projects, hackathons, learning projects, open source. Less interrogative, more exploratory.

## How to Use

### Step 1: Detect Mode

Read the context before asking anything. Auto-detect mode based on signals:

- **Startup mode signals:** mentions of revenue, customers, market, raising money, quitting job, "is this a real business", "should I pursue this full-time"
- **Builder mode signals:** mentions of hackathon, weekend project, learning, open source, "fun idea", "just exploring", "side project"

If unclear, ask one question: "Is this something you're thinking about seriously as a startup, or more of a builder/side project?"

Do not ask this if the context already makes it obvious.

---

### Step 2: Run the Dialogue

Ask questions **one at a time**. Never dump a list of questions. Wait for the answer, then decide whether to probe deeper on that answer or move to the next question.

After each answer, do one of:
- **Probe deeper** — if the answer is vague, assumed, or reveals something worth unpacking ("you said X, but have you actually confirmed that with anyone?")
- **Pivot** — if the answer reveals the premise is wrong or a more important question has surfaced
- **Advance** — if the answer is crisp and you have what you need

---

#### Startup Mode Questions (work through these, not necessarily in order)

1. **Who is desperate for this?** Not "who would use this" — who is in enough pain today that they would pay before the product is finished? Be specific. A job title is not enough. What does their day look like?

2. **What are they doing today without your solution?** What is the current workaround? How bad is it? If there's no workaround, is the problem real? If the workaround works fine, why would they switch?

3. **What's the most specific type of person who would immediately pay?** Not the broad TAM — the narrow beachhead. The person who, if you emailed them today with a rough demo, would respond within 24 hours asking for access.

4. **What's the narrowest wedge into this market?** What is the smallest foothold that is still defensible? Where can you win before you have to compete on breadth?

5. **Have you watched someone struggle with this problem in real life?** Not heard about it — watched it. Describe what you saw. What surprised you?

6. **In 3 years, why would this be a massive company vs a lifestyle business?** What is the mechanism for scale? Network effects, data moat, distribution advantage, something else? Why does this get harder to compete with over time?

After working through these (or enough of them to have a clear picture), proceed to Step 3.

---

#### Builder Mode Questions (generative, pick based on context)

1. **What's the core thing you want to exist that doesn't exist yet?** Describe it simply, as if explaining to someone who doesn't know the space.

2. **Who is the first person you'd show this to, and what would their reaction be?** What would excite them? What would confuse them?

3. **What's the most interesting technical or design challenge here?** What part of building this would actually be fun?

4. **If you had to ship something in one weekend, what would be the smallest version that's still interesting?** What can you cut? What must stay?

5. **What would success look like in 3 months?** Not metrics — what would you be proud of?

6. **Is there a version of this that teaches you something, even if no one uses it?** What do you want to learn from building it?

---

### Step 3: Synthesize

After the dialogue, give a short verbal synthesis (3-5 sentences) covering:
- What you heard as the core idea
- What seems strong
- What seems uncertain or unvalidated
- What the key open question is

Then state a clear recommendation:
- **Proceed** — the idea has demand signal, a clear beachhead, and a plausible path. Say what the first concrete action should be.
- **Pivot** — the core idea has merit but the framing is off. Say what the better version of the question is.
- **Abandon** — the problem isn't real, the solution doesn't fit, or the founder isn't the right person. Say why clearly, without softening it.

For builder mode: replace Proceed/Pivot/Abandon with "Start building", "Redesign first", or "Try a different angle".

---

### Step 4: Save Design Notes

Write a brief summary to `/workspace/group/design-notes.md`. Append if the file already exists (do not overwrite).

Format:
```
## [Date] — [One-line idea description]

**Mode:** Startup / Builder
**Core idea:** [1-2 sentences]
**Key insight from dialogue:** [What emerged that wasn't obvious at the start]
**Open questions:** [Bullet list of unresolved questions]
**Recommendation:** Proceed / Pivot / Abandon — [one sentence why]
**Next step:** [Concrete action]
```

Tell the user you've saved the notes and where.
