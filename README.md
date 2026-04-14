# Bet We Won!

A single-page browser game: you spin a **10-residue CDR3** slot (**V3 · D 4 · J 3**), pick one of two best-matching antigens, spend three mutation points to tune the sequence, then finalize. **Bounties** (10–50 pts by difficulty, **100** for Bet v 1) add to your **session score** on a win. **Autoimmunity wipes the entire score**; **cell elimination costs 30 points** (score can go negative). **Restart** resets the score to zero.

**Stack:** static HTML, CSS, and vanilla JavaScript only (no frameworks, no build, no backend).

## Assets

Place transparent PNGs in [`assets/`](assets/):

- `igg1.png` — antibody (decorative)
- `betv1.png`, `covid.png` — jackpot-style showcase tiles (amounts match in-game bounties for those targets).
- `dna.png` — **dsDNA** on the title screen only (red tile, no bounty); **not** the in-game “DNA-binding protein” antigen.

## How to play locally

1. Open `index.html` in a modern desktop browser.
2. **Restart** sets score to 0 and returns to the title screen.
3. Pull the **lever** to spin V / D / J reels, then pick a target, mutate, finalize.
4. Or use a static server, e.g. `python3 -m http.server 8080` and open `http://localhost:8080/`.

Keep `index.html`, `style.css`, `script.js`, and the `assets/` folder together (paths are relative).

## Deploying behind nginx

Copy the project folder (including `assets/`) to your web root. Example:

```nginx
server {
    listen 80;
    server_name your.domain.example;
    root /var/www/bet-we-won;
    index index.html;
}
```

## Game flow (short)

1. **Spin** — Random CDR3 (10 residues); flanking context appears on the mutate screen only.
2. **Choose antigen** — Top two by affinity; each card shows **bounty** and match preview.
3. **Mutate** — Three replacements; stats update live.
4. **Finalize** — Win: +bounty to score. Death: **−30** to score. Autoimmune: **score → 0**.

Scoring is a toy model for outreach—not a biophysical predictor.

## License

Use and adapt freely for outreach. Add a formal license file if you need one.
