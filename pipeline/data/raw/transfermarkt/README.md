# Filtered Transfermarkt files go here

Drop your **filtered** (small) Kaggle `player-scores` files in this folder, commit
and push them, and tell me — I'll extract the Premier-League slice into each
season and rebuild.

The converter needs these (standard Kaggle column names):

| file | required | size after filtering |
|---|---|---|
| `appearances.csv` | ✅ | filter to PL → small |
| `players.csv` | ✅ | usually < 25 MB as-is |
| `clubs.csv` | ✅ | tiny, upload as-is |
| `transfers.csv` | – | usually < 25 MB as-is |
| `player_valuations.csv` | – | skip if too big (impact falls back to minutes + goals) |

## Filtering `appearances.csv` (the 300 MB+ one) to PL only

The Premier League is competition id **`GB1`**. Keep only those rows. Run **one**
of these in the folder that holds your Kaggle files — no Python:

**macOS / Linux (Terminal):**
```bash
head -1 appearances.csv > pl.csv
grep ',GB1,' appearances.csv >> pl.csv
mv pl.csv appearances.csv
```

If it's still over 25 MB, also keep just the seasons you want (e.g. 2021–2023):
```bash
head -1 appearances.csv > pl.csv
grep ',GB1,' appearances.csv | grep -E ',(2021|2022|2023)-[0-9]{2}-' >> pl.csv
mv pl.csv appearances.csv
```

**Windows (PowerShell):**
```powershell
Import-Csv appearances.csv |
  Where-Object { $_.competition_id -eq 'GB1' } |
  Export-Csv pl_appearances.csv -NoTypeInformation
```
(then rename `pl_appearances.csv` to `appearances.csv`)

`players.csv`, `clubs.csv` and `transfers.csv` are usually small enough to upload
as-is. Skip `player_valuations.csv` if it's too big — the game still works, it
just uses a minutes + goals/assists impact formula instead of market value.

Once the files are here, the season folders you've added (`../seasons/PL_<year>/`)
get their `players.csv` / `transfers.csv` filled automatically on the next build.
