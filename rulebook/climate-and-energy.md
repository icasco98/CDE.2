# Climate and energy: Kuwait

Three sources, three jobs. **MEW/R-6** (Kuwait's Energy Conservation
Code of Practice) supplies the compliance walls once its edition is in
hand. **ASHRAE 169** supplies the climate the physics reads. **ASHRAE
55** supplies the comfort criteria a verdict cites. **ASHRAE 90.2** is
a cross-check where R-6 is silent.

**Status.** Every number below is `provisional`: taken from published
summaries, search results and recalled standard tables, not from a
copy of the code or standard. Under decision 9 a provisional rule can
only recommend. Each becomes `sourced` when the owner supplies the
firm's edition and the number is checked against it. The owner has
said the MEW PDF is not yet available and that internet values are to
be used meanwhile.

**Licensing.** ASHRAE standards and, possibly, R-6 are licensed
documents. This file carries specific values with their clause where
known, never the text. When the firm's copies arrive, the values are
verified against them and cited by clause; the documents themselves
never enter the repository.

## Climate: ASHRAE 169, Kuwait International Airport

| Item | Value | Basis |
|---|---|---|
| Climate zone | 0B, extremely hot and dry | 169-2013 onward; verify in 169-2021 |
| Cooling design dry bulb, 0.4% | about 46 to 47 °C | recalled; verify on ashrae-meteo.info, station 405820 |
| Mean coincident wet bulb at that dry bulb | about 20 to 22 °C | recalled; verify |
| Heating design dry bulb, 99.6% | about 5 to 6 °C | recalled; verify |
| Cooling degree-days base 10 °C | about 5 000 to 5 500 | recalled; verify |
| Heating degree-days base 18 °C | under 300 | recalled; verify |
| Peak horizontal solar radiation, June | about 7 kWh/m² per day | recalled; verify against a Kuwait typical-year file |
| Prevailing wind | north-west (shamal), summer, dust-laden | recalled; verify |

What the tool does with these: sun position and shadow from latitude
29.2° N and longitude 47.9° E; facade radiation ranking (west and
south-west worst in summer, north best); a design-day cooling proxy per
room from facade area, glazing ratio and orientation; a note that
natural ventilation is not a summer strategy here and that night
flushing is limited.

## Compliance walls: MEW/R-6

Reported for villas in published summaries of the 2014 edition.
Edition history reported as 1983, 2010, 2014, 2018; copies labelled
2016 circulate. Which edition the permit office applies is unconfirmed.

| Item | Reported value | Basis |
|---|---|---|
| Wall U-value, maximum | 0.42 W/m²K (varies by construction weight and surface colour) | internet-reported, unverified |
| Roof U-value, maximum | 0.20 W/m²K | internet-reported, unverified |
| Glazing shading coefficient | 0.25 for glazed area between 15% and 50% of the wall | internet-reported, unverified |
| Window-to-wall ratio | limited, upper bound reported around 50% with the shading condition above; lower ratios relax the glazing requirement | internet-reported, unverified; exact table needed |
| Glazing U-value | double glazing expected; value unverified | unverified |
| Air-conditioning efficiency | minimum EER by unit type | unverified |
| Cooling power per unit floor area | a cap exists per building type | unverified; villa figure needed |

What the tool does with these until verified: glazing ratio per facade
is shown against the reported 15% to 50% band as a recommendation;
wall and roof U-values are assumptions the person can edit, shown next
to any cooling proxy; nothing blocks a layout.

## Comfort criteria: ASHRAE 55

| Item | Value | Basis |
|---|---|---|
| Acceptable PMV | between −0.5 and +0.5 | 55-2023 section 5.3, recalled |
| Summer operative temperature at 0.5 clo, 50% RH | about 23 to 26 °C | recalled |
| Humidity ratio upper limit | 0.012 kg/kg | 55-2023, recalled |
| Adaptive model | not applicable to sealed, air-conditioned houses | 55 applicability conditions |

What the tool does with these: a verdict such as "west-facing living
room, highest afternoon cooling load" cites the comfort band it is
protecting; no PMV is computed at massing stage.

## Cross-check: ASHRAE 90.2 and IECC, climate zones 0 and 1

Public IECC 2018 and 2021 prescriptive values for zone 1 (zone 0 added
in 2021 with the same envelope rows), used only to sanity-check R-6
figures; 90.2-2018 tracks them closely.

| Item | Value | Basis |
|---|---|---|
| Ceiling | R-30 (about U 0.19 W/m²K) | IECC zone 1, recalled |
| Wood-frame wall | R-13 (about U 0.48 W/m²K) | IECC zone 1, recalled |
| Mass wall | R-3 outside or R-4 inside | IECC zone 1, recalled |
| Fenestration U-factor | 0.50 Btu/h·ft²·°F (about 2.8 W/m²K) | IECC 2018 zone 1, recalled |
| Fenestration SHGC | 0.25 | IECC zone 1, recalled |

The reported R-6 wall and roof values are tighter than the IECC zone 1
rows, which is plausible for a code written for 46 °C design days.

## To verify, in order

1. The firm's R-6 edition: every row in the compliance table, plus the
   window-to-wall table and the villa cooling-power cap.
2. Station 405820 on ashrae-meteo.info or Standard 169-2021: the seven
   climate rows.
3. The firm's ASHRAE 55 edition: the three comfort rows.
4. 90.2-2018 tables 6-23 and 7-2 if the firm holds a copy; otherwise
   leave the IECC rows as the cross-check.

## Sources consulted

Search results only; the pages themselves could not be opened from
the build environment.

- Kuwait energy code summaries: witpress SC20 comparative review;
  IOP 2025 four-decade assessment; Springer 2025 window study for
  Kuwait; Climate Change Laws entry for R-6; KISR project page.
- ASHRAE: Standard 169-2020 addendum a; ashrae-meteo.info station
  finder; Standard 55-2023 summaries; 90.2-2018 fact sheet and
  addendum j; IECC zone tables via UpCodes.
