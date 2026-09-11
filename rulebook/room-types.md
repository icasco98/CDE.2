# Room types

The kinds of room the tool knows, and the numbers each carries. This
is the table the program screen fills sizes from and the checker
measures rooms against. One copy; the code loads it, never restates it.

**Basis.** The legal floor for each kind comes from
`municipality-private-housing.md` (minimum room 10 m² and 3 m wide,
kitchen 7.5 m² and 2 m, bathroom 4 m² and 1.75 m, WC 1.5 m² and
1.2 m, corridor 1.2 m clear, light well 9 m² with a 1.5 m side). The
tool never lets a room go below its legal floor. Typical sizes and
ranges are the cofounder's judgement for a villa on a 400 to 750 m²
plot, checked against published residential ranges and Gulf practice,
and are marked `judgement`; the owner adjusts them as projects show.

**Columns.** *Typical* is what a new room gets. *Range* is what the
tool treats as normal; outside it, a finding says so. *Proportion* is
the range of short side to long side the tool suggests. *Category* is
private, shared, service or reception; it colours the drawing.
*Tier* drives the privacy-gradient check (public, semi-public,
private; exempt kinds are never checked). *Circulation* kinds are the
ones a stair or a front door may open onto. *Auxiliary* kinds are
entered through one owning room.

*Default storey* is where a kind opens when the program is rebuilt:
`ground`, `upper`, `any` (either floor suits it, and the tool opens it
on the ground), `all` (every storey at once, which is what a stair and
a lift do) or `top` (the roof). A Kuwaiti villa receives and serves on
the ground — reception, family living, dining, kitchen, service, staff
and garage — and sleeps above it, so bedrooms and their suites are
`upper`, with the master bedroom coming down to the ground when the
household asks for it; family living is `any` because many villas keep
a second one on the bedroom floor. *Companion* is the kind a room
brings with it — a bedroom's ensuite, the diwaniya's WC, a staff
room's bathroom — and a companion always takes the storey of the room
it serves. Both columns are the cofounder's judgement and provisional.

## The default program

Every villa starts with the standard trio, each a different kind:

- **Diwaniya**, public, with its own street entrance and its own WC.
- **Formal Living**, public, reached from the family entrance, where
  the household receives guests it has invited in.
- **Family Living**, private, where the household lives.

**Women's Reception** is a fourth kind, off by default, switched on per
household. Houses that go past the trio add kinds; they do not change
the trio.

## Sizes that scale with the plot

The diwaniya and the two living rooms scale with plot and family. The
program screen picks the band from the plot entered; the household
entry can override it.

| Plot | Diwaniya | Formal Living | Family Living |
|---|---|---|---|
| up to 400 m² | 35 to 45 | 24 to 30 | 24 to 32 |
| 400 to 750 m² | 45 to 60 | 30 to 40 | 32 to 45 |
| above 750 m² | 60 to 90 | 40 to 55 | 45 to 60 |

## The table

Areas in m². "–" in the legal column means the Municipality sets
nothing and the bottom of the range is the floor.

| Kind | Arabic | Legal floor | Typical | Range | Proportion | Category | Tier | Default storey | Companion | Flags | Basis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Entry / Foyer | مدخل | – | 8 | 6 to 12 | 1:1 to 1:1.5 | shared | public | ground | – | circulation | judgement |
| Diwaniya | ديوانية | 10 m², 3 m | by plot band | by plot band | 1:1.2 to 1:2 | reception | public | ground | diwaniya-wc |  | judgement; about 3 m² per seated guest |
| Diwaniya WC | حمام الديوانية | 4 m², 1.75 m | 5 | 4 to 6 | 1:1 to 1:1.6 | service | exempt | ground | – | auxiliary | legal |
| Formal Living | صالة رسمية | 10 m², 3 m | by plot band | by plot band | 1:1 to 1:1.6 | shared | public | ground | – |  | judgement |
| Family Living | صالة المعيشة | 10 m², 3 m | by plot band | by plot band | 1:1 to 1:1.6 | shared | private | any | – |  | judgement |
| Women's Reception | مجلس نساء | 10 m², 3 m | 30 | 24 to 40 | 1:1 to 1:1.6 | shared | public | ground | – | optional | judgement |
| Dining Room | غرفة الطعام | 10 m², 3 m | 24 | 18 to 32 | 1:1.2 to 1:1.8 | shared | semi-public | ground | – |  | judgement; 10 to 12 seats |
| Kitchen | مطبخ | 7.5 m², 2 m | 20 | 14 to 28 | 1:1 to 1:1.8 | shared | private | ground | – |  | legal floor; judgement above |
| Prep Kitchen | مطبخ تحضيري | 7.5 m², 2 m | 10 | 8 to 14 | 1:1 to 1:1.6 | service | exempt | ground | – |  | judgement |
| Master Bedroom | غرفة النوم الرئيسية | 10 m², 3 m | 28 | 22 to 36 | 1:1 to 1:1.5 | private | private | upper | ensuite-bathroom |  | judgement |
| Bedroom | غرفة نوم | 10 m², 3 m | 18 | 14 to 22 | 1:1 to 1:1.5 | private | private | upper | ensuite-bathroom |  | judgement |
| Ensuite Bathroom | حمام ملحق | 4 m², 1.75 m | 6 | 5 to 8 | 1:1 to 1:1.8 | private | exempt | upper | – | auxiliary | legal |
| Bathroom | حمام | 4 m², 1.75 m | 5 | 4 to 7 | 1:1 to 1:1.8 | private | exempt | upper | – | auxiliary | legal |
| Guest WC | حمام ضيوف | 1.5 m², 1.2 m | 3 | 2.5 to 4 | 1:1 to 1:1.8 | service | exempt | ground | – | auxiliary | legal |
| Dressing Room | غرفة ملابس | – | 8 | 6 to 12 | 1:1 to 1:1.8 | private | private | upper | – | auxiliary | judgement |
| Office / Study | مكتب | 10 m², 3 m | 14 | 12 to 18 | 1:1 to 1:1.5 | private | private | any | – |  | judgement |
| Prayer Room | غرفة صلاة | 10 m², 3 m as a room | 9 | 6 to 12 | 1:1 to 1:1.5 | private | private | any | – |  | judgement; under 10 m² it is an alcove |
| Laundry | غسيل | – | 8 | 6 to 10 | 1:1 to 1:1.6 | service | exempt | ground | – |  | judgement |
| Storage | مخزن | – | 6 | 4 to 10 | 1:1 to 1:2 | service | exempt | ground | – |  | judgement |
| Service Entrance | مدخل خدمة | – | 5 | 3 to 8 | 1:1 to 1:2 | service | semi-public | ground | – | circulation | judgement |
| Hallway | ممر | 1.2 m clear | 1.5 to 1.8 m wide | length as needed | free | shared | semi-public | any | – | circulation | legal width |
| Stair | درج | 1.2 m clear; riser ≤ 17 cm; ≤ 14 risers per run | 15 | 12 to 20 | 1:1.6 to 1:2.2 | shared | semi-public | all | – | circulation | legal geometry |
| Lift | مصعد | – | 5 | 4 to 6 | 1:1 | shared | semi-public | all | – | circulation; not in the ratio | judgement |
| Maid Room | غرفة خادمة | 10 m², 3 m | 12 | 10 to 14 | 1:1 to 1:1.4 | service | private | ground | maid-bathroom |  | legal floor |
| Maid Bathroom | حمام الخادمة | 4 m², 1.75 m | 4.5 | 4 to 5 | 1:1 to 1:1.6 | service | exempt | ground | – | auxiliary | legal |
| Driver Room | غرفة سائق | 10 m², 3 m | 12 | 10 to 14 | 1:1 to 1:1.4 | service | private | ground | driver-bathroom | own door, by the garage | legal floor |
| Driver Bathroom | حمام السائق | 4 m², 1.75 m | 4.5 | 4 to 5 | 1:1 to 1:1.6 | service | exempt | ground | – | auxiliary | legal |
| Garage, per car | كراج | – | 18 per car | 16 to 21 per car | 1:1.7 to 1:2 per bay | service | exempt | ground | – |  | judgement; 3 × 6 m bay |
| Courtyard | حوش / فناء | 9 m², 1.5 m side if it lights rooms | 25 | 16 to 50 | 1:1 to 1:1.6 | open | exempt | ground | – | not in the ratio | legal light well |
| Roof Annex | ملحق السطح | at most 100 m², counted | 40 | 25 to 100 | free | shared | private | top | – |  | legal cap |
| Room (other) | غرفة | 10 m², 3 m | 12 | 10 to 20 | 1:1 to 1:1.6 | shared | exempt | any | – |  | legal floor |

## Least certain

Diwaniya bands, bedroom typical (some firms plan 20 to 24 for
children's rooms), and the split between Formal Living and Women's
Reception. These are the first cells to revisit after the known
house is entered.
