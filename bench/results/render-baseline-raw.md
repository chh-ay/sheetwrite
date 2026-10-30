# Auditable render benchmark

Protocol version: **1**  
Run ID: `2a4eab5d-befb-402d-82bd-a7abe2447baf`  
Matrix: **complete and successful**

## Environment

| Field | Value |
|:--|:--|
| Commit | `ac4ab632d80abf8d0c2986685c04ebce7747e5fa` (clean) |
| Timestamp | 2026-10-29T04:05:12.652Z |
| Runtime | Bun 1.4.4; Node 26.3.0 |
| Browser | 153.0.8010.12 |
| OS / arch | linux 7.3.0-4-cachyos / x64 |
| CPU | 12th Gen Intel(R) Core(TM) i9-12900H |
| Engines | Sheetwrite 0.5.4; Handsontable 18.1.2 |
| Dataset | seed 1592639710; 100,000 rows = `fnv1a32:178eac66` |
| Viewport | 640 × 480 |
| Sampling | 1 excluded warmup aggregate(s), 3 measured aggregate(s), minimum 100 ms each |
| Counterbalance | seed 1371602926; round 1: handsontable → sheetwrite; round 2: sheetwrite → handsontable; round 3: handsontable → sheetwrite; round 4: sheetwrite → handsontable; round 5: handsontable → sheetwrite; round 6: sheetwrite → handsontable; round 7: handsontable → sheetwrite; round 8: sheetwrite → handsontable; round 9: handsontable → sheetwrite; round 10: sheetwrite → handsontable |
| Browser launches | 20 attempt(s); 0 failed attempt(s), all recorded in raw JSON |

Every cell below is linked to the raw JSON. Timings are per logical operation and use every measured sample; p95 is linearly interpolated and MAD is the median absolute deviation. Setup, cleanup, and declared warmups are excluded.

## Results

| round | rows | scenario / raw identity | Sheetwrite | Handsontable |
|---:|---:|:--|:--|:--|
| 1 | 100,000 | [`r1-100000-scroll-down.top-left`](./render-results.json) | median 1.410 ms; p95 1.511; MAD 0.11287; 3 samples / 219 ops | median 20.940 ms; p95 21.156; MAD 0.24000; 3 samples / 15 ops |
| 1 | 100,000 | [`r1-100000-scroll-down.middle`](./render-results.json) | median 1.173 ms; p95 1.233; MAD 0.06625; 3 samples / 259 ops | median 6.920 ms; p95 7.975; MAD 0.23333; 3 samples / 43 ops |
| 1 | 100,000 | [`r1-100000-scroll-smooth.same-window`](./render-results.json) | median 0.39722 ms; p95 0.41009; MAD 0.01222; 3 samples / 755 ops | median 10.370 ms; p95 10.523; MAD 0.05000; 3 samples / 30 ops |
| 1 | 100,000 | [`r1-100000-scroll-right.top-left`](./render-results.json) | median 0.25126 ms; p95 0.30883; MAD 0.00971; 3 samples / 1160 ops | median 16.329 ms; p95 16.534; MAD 0.05714; 3 samples / 21 ops |
| 1 | 100,000 | [`r1-100000-edit-open.top-left`](./render-results.json) | median 0.61726 ms; p95 0.66575; MAD 0.05378; 3 samples / 495 ops | median 1.125 ms; p95 1.501; MAD 0.06577; 3 samples / 249 ops |
| 1 | 100,000 | [`r1-100000-edit-open.middle`](./render-results.json) | median 0.64151 ms; p95 0.73646; MAD 0.00457; 3 samples / 450 ops | median 0.99604 ms; p95 1.038; MAD 0.00198; 3 samples / 298 ops |
| 1 | 100,000 | [`r1-100000-edit-open.bottom-right`](./render-results.json) | median 0.57500 ms; p95 0.59004; MAD 0.01672; 3 samples / 554 ops | median 1.408 ms; p95 1.802; MAD 0.03037; 3 samples / 199 ops |
| 1 | 100,000 | [`r1-100000-edit-commit.middle`](./render-results.json) | median 0.97087 ms; p95 1.139; MAD 0.06637; 3 samples / 301 ops | median 7.815 ms; p95 7.829; MAD 0.01538; 3 samples / 40 ops |
| 1 | 100,000 | [`r1-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.002 ms; p95 2.204; MAD 0.22453; 3 samples / 166 ops | median 17.367 ms; p95 17.757; MAD 0.43333; 3 samples / 18 ops |
| 1 | 100,000 | [`r1-100000-altering.remove-5-rows-top`](./render-results.json) | median 1.603 ms; p95 1.744; MAD 0.10019; 3 samples / 187 ops | median 15.429 ms; p95 15.467; MAD 0.04286; 3 samples / 21 ops |
| 1 | 100,000 | [`r1-100000-arrow-down.top-left`](./render-results.json) | median 0.70493 ms; p95 0.78057; MAD 0.03245; 3 samples / 418 ops | median 1.401 ms; p95 2.142; MAD 0.00278; 3 samples / 189 ops |
| 1 | 100,000 | [`r1-100000-arrow-right.middle`](./render-results.json) | median 0.65556 ms; p95 0.74215; MAD 0.02011; 3 samples / 452 ops | median 1.320 ms; p95 1.338; MAD 0.00545; 3 samples / 228 ops |
| 1 | 100,000 | [`r1-100000-formatted-paint.top-left`](./render-results.json) | median 0.00376 ms; p95 0.00417; MAD 0.00006; 3 samples / 77623 ops | median 6.135 ms; p95 6.178; MAD 0.01765; 3 samples / 51 ops |
| 1 | 100,000 | [`r1-100000-merge-heavy.paint`](./render-results.json) | median 0.00324 ms; p95 0.00329; MAD 0.00001; 3 samples / 92234 ops | median 6.369 ms; p95 6.419; MAD 0.05625; 3 samples / 48 ops |
| 2 | 100,000 | [`r2-100000-scroll-down.top-left`](./render-results.json) | median 1.353 ms; p95 1.491; MAD 0.15264; 3 samples / 226 ops | median 21.240 ms; p95 21.348; MAD 0.12000; 3 samples / 15 ops |
| 2 | 100,000 | [`r2-100000-scroll-down.middle`](./render-results.json) | median 1.103 ms; p95 1.124; MAD 0.01835; 3 samples / 274 ops | median 6.700 ms; p95 8.387; MAD 0.02667; 3 samples / 43 ops |
| 2 | 100,000 | [`r2-100000-scroll-smooth.same-window`](./render-results.json) | median 0.39565 ms; p95 0.46781; MAD 0.01611; 3 samples / 728 ops | median 10.490 ms; p95 10.634; MAD 0.03000; 3 samples / 30 ops |
| 2 | 100,000 | [`r2-100000-scroll-right.top-left`](./render-results.json) | median 0.27322 ms; p95 0.33982; MAD 0.03318; 3 samples / 1071 ops | median 16.157 ms; p95 16.196; MAD 0.04286; 3 samples / 21 ops |
| 2 | 100,000 | [`r2-100000-edit-open.top-left`](./render-results.json) | median 0.61534 ms; p95 0.66616; MAD 0.04659; 3 samples / 488 ops | median 1.101 ms; p95 1.208; MAD 0.00762; 3 samples / 265 ops |
| 2 | 100,000 | [`r2-100000-edit-open.middle`](./render-results.json) | median 0.64581 ms; p95 0.77263; MAD 0.02283; 3 samples / 444 ops | median 1.038 ms; p95 1.084; MAD 0.02299; 3 samples / 288 ops |
| 2 | 100,000 | [`r2-100000-edit-open.bottom-right`](./render-results.json) | median 0.57586 ms; p95 0.63391; MAD 0.03370; 3 samples / 525 ops | median 1.433 ms; p95 1.551; MAD 0.06664; 3 samples / 208 ops |
| 2 | 100,000 | [`r2-100000-edit-commit.middle`](./render-results.json) | median 1.155 ms; p95 1.242; MAD 0.09663; 3 samples / 284 ops | median 7.614 ms; p95 7.816; MAD 0.05714; 3 samples / 41 ops |
| 2 | 100,000 | [`r2-100000-altering.insert-5-rows-top`](./render-results.json) | median 1.788 ms; p95 1.963; MAD 0.01289; 3 samples / 168 ops | median 17.250 ms; p95 17.685; MAD 0.20000; 3 samples / 18 ops |
| 2 | 100,000 | [`r2-100000-altering.remove-5-rows-top`](./render-results.json) | median 1.702 ms; p95 1.763; MAD 0.06460; 3 samples / 178 ops | median 15.529 ms; p95 15.593; MAD 0.07143; 3 samples / 21 ops |
| 2 | 100,000 | [`r2-100000-arrow-down.top-left`](./render-results.json) | median 0.73262 ms; p95 0.77042; MAD 0.04199; 3 samples / 429 ops | median 1.430 ms; p95 1.436; MAD 0.00183; 3 samples / 211 ops |
| 2 | 100,000 | [`r2-100000-arrow-right.middle`](./render-results.json) | median 0.65987 ms; p95 0.72908; MAD 0.03094; 3 samples / 447 ops | median 1.521 ms; p95 2.532; MAD 0.18490; 3 samples / 180 ops |
| 2 | 100,000 | [`r2-100000-formatted-paint.top-left`](./render-results.json) | median 0.00382 ms; p95 0.00387; MAD 0.00006; 3 samples / 79594 ops | median 6.018 ms; p95 6.187; MAD 0.02941; 3 samples / 51 ops |
| 2 | 100,000 | [`r2-100000-merge-heavy.paint`](./render-results.json) | median 0.00328 ms; p95 0.00330; MAD 0.00001; 3 samples / 91334 ops | median 6.194 ms; p95 6.363; MAD 0.02941; 3 samples / 50 ops |
| 3 | 100,000 | [`r3-100000-scroll-down.top-left`](./render-results.json) | median 1.351 ms; p95 1.643; MAD 0.13810; 3 samples / 217 ops | median 21.480 ms; p95 21.768; MAD 0.32000; 3 samples / 15 ops |
| 3 | 100,000 | [`r3-100000-scroll-down.middle`](./render-results.json) | median 1.108 ms; p95 1.131; MAD 0.02564; 3 samples / 274 ops | median 6.820 ms; p95 7.509; MAD 0.19500; 3 samples / 45 ops |
| 3 | 100,000 | [`r3-100000-scroll-smooth.same-window`](./render-results.json) | median 0.39920 ms; p95 0.47644; MAD 0.01382; 3 samples / 718 ops | median 10.340 ms; p95 10.745; MAD 0.06000; 3 samples / 30 ops |
| 3 | 100,000 | [`r3-100000-scroll-right.top-left`](./render-results.json) | median 0.25431 ms; p95 0.28357; MAD 0.01108; 3 samples / 1164 ops | median 16.329 ms; p95 16.457; MAD 0.07143; 3 samples / 21 ops |
| 3 | 100,000 | [`r3-100000-edit-open.top-left`](./render-results.json) | median 0.59940 ms; p95 0.65641; MAD 0.04995; 3 samples / 502 ops | median 1.055 ms; p95 1.147; MAD 0.00578; 3 samples / 280 ops |
| 3 | 100,000 | [`r3-100000-edit-open.middle`](./render-results.json) | median 0.63758 ms; p95 0.68205; MAD 0.04941; 3 samples / 478 ops | median 1.036 ms; p95 1.080; MAD 0.03408; 3 samples / 290 ops |
| 3 | 100,000 | [`r3-100000-edit-open.bottom-right`](./render-results.json) | median 0.58142 ms; p95 0.60085; MAD 0.00498; 3 samples / 523 ops | median 1.423 ms; p95 1.458; MAD 0.01127; 3 samples / 211 ops |
| 3 | 100,000 | [`r3-100000-edit-commit.middle`](./render-results.json) | median 0.94486 ms; p95 1.051; MAD 0.08020; 3 samples / 320 ops | median 7.831 ms; p95 8.025; MAD 0.03077; 3 samples / 39 ops |
| 3 | 100,000 | [`r3-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.039 ms; p95 2.205; MAD 0.18502; 3 samples / 166 ops | median 17.417 ms; p95 18.347; MAD 0.11667; 3 samples / 18 ops |
| 3 | 100,000 | [`r3-100000-altering.remove-5-rows-top`](./render-results.json) | median 1.766 ms; p95 1.863; MAD 0.06043; 3 samples / 171 ops | median 15.586 ms; p95 15.881; MAD 0.32857; 3 samples / 21 ops |
| 3 | 100,000 | [`r3-100000-arrow-down.top-left`](./render-results.json) | median 0.69930 ms; p95 0.73368; MAD 0.03786; 3 samples / 432 ops | median 1.439 ms; p95 1.522; MAD 0.01181; 3 samples / 207 ops |
| 3 | 100,000 | [`r3-100000-arrow-right.middle`](./render-results.json) | median 0.69653 ms; p95 0.71278; MAD 0.01806; 3 samples / 439 ops | median 1.382 ms; p95 1.388; MAD 0.00670; 3 samples / 221 ops |
| 3 | 100,000 | [`r3-100000-formatted-paint.top-left`](./render-results.json) | median 0.00358 ms; p95 0.00382; MAD 0.00024; 3 samples / 84954 ops | median 6.165 ms; p95 6.922; MAD 0.07059; 3 samples / 49 ops |
| 3 | 100,000 | [`r3-100000-merge-heavy.paint`](./render-results.json) | median 0.00326 ms; p95 0.00327; MAD 0.00000; 3 samples / 91951 ops | median 6.247 ms; p95 6.525; MAD 0.01176; 3 samples / 50 ops |
| 4 | 100,000 | [`r4-100000-scroll-down.top-left`](./render-results.json) | median 1.549 ms; p95 1.553; MAD 0.00459; 3 samples / 211 ops | median 21.740 ms; p95 21.884; MAD 0.16000; 3 samples / 15 ops |
| 4 | 100,000 | [`r4-100000-scroll-down.middle`](./render-results.json) | median 1.259 ms; p95 1.396; MAD 0.14208; 3 samples / 241 ops | median 6.973 ms; p95 8.295; MAD 0.31708; 3 samples / 43 ops |
| 4 | 100,000 | [`r4-100000-scroll-smooth.same-window`](./render-results.json) | median 0.39488 ms; p95 0.44109; MAD 0.01136; 3 samples / 740 ops | median 10.680 ms; p95 11.888; MAD 0.06000; 3 samples / 29 ops |
| 4 | 100,000 | [`r4-100000-scroll-right.top-left`](./render-results.json) | median 0.26552 ms; p95 0.29075; MAD 0.01713; 3 samples / 1121 ops | median 16.400 ms; p95 16.477; MAD 0.04286; 3 samples / 21 ops |
| 4 | 100,000 | [`r4-100000-edit-open.top-left`](./render-results.json) | median 0.64114 ms; p95 0.69724; MAD 0.06233; 3 samples / 485 ops | median 1.224 ms; p95 1.347; MAD 0.13642; 3 samples / 250 ops |
| 4 | 100,000 | [`r4-100000-edit-open.middle`](./render-results.json) | median 0.63145 ms; p95 0.75628; MAD 0.04145; 3 samples / 463 ops | median 1.006 ms; p95 1.030; MAD 0.02632; 3 samples / 303 ops |
| 4 | 100,000 | [`r4-100000-edit-open.bottom-right`](./render-results.json) | median 0.55359 ms; p95 0.56249; MAD 0.00989; 3 samples / 566 ops | median 1.429 ms; p95 1.599; MAD 0.01026; 3 samples / 203 ops |
| 4 | 100,000 | [`r4-100000-edit-commit.middle`](./render-results.json) | median 1.115 ms; p95 1.175; MAD 0.06596; 3 samples / 280 ops | median 7.731 ms; p95 7.800; MAD 0.03846; 3 samples / 39 ops |
| 4 | 100,000 | [`r4-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.088 ms; p95 2.156; MAD 0.07583; 3 samples / 157 ops | median 16.186 ms; p95 16.994; MAD 0.85714; 3 samples / 20 ops |
| 4 | 100,000 | [`r4-100000-altering.remove-5-rows-top`](./render-results.json) | median 1.644 ms; p95 1.679; MAD 0.03907; 3 samples / 189 ops | median 15.671 ms; p95 15.736; MAD 0.07143; 3 samples / 21 ops |
| 4 | 100,000 | [`r4-100000-arrow-down.top-left`](./render-results.json) | median 0.66800 ms; p95 0.71977; MAD 0.05702; 3 samples / 459 ops | median 1.535 ms; p95 1.566; MAD 0.03037; 3 samples / 199 ops |
| 4 | 100,000 | [`r4-100000-arrow-right.middle`](./render-results.json) | median 0.67733 ms; p95 0.72317; MAD 0.02243; 3 samples / 441 ops | median 1.353 ms; p95 1.424; MAD 0.00737; 3 samples / 221 ops |
| 4 | 100,000 | [`r4-100000-formatted-paint.top-left`](./render-results.json) | median 0.00357 ms; p95 0.00359; MAD 0.00002; 3 samples / 83966 ops | median 6.118 ms; p95 6.149; MAD 0.02941; 3 samples / 51 ops |
| 4 | 100,000 | [`r4-100000-merge-heavy.paint`](./render-results.json) | median 0.00324 ms; p95 0.00325; MAD 0.00001; 3 samples / 92629 ops | median 6.306 ms; p95 6.503; MAD 0.00625; 3 samples / 48 ops |
| 5 | 100,000 | [`r5-100000-scroll-down.top-left`](./render-results.json) | median 1.437 ms; p95 1.563; MAD 0.13942; 3 samples / 218 ops | median 21.540 ms; p95 21.738; MAD 0.22000; 3 samples / 15 ops |
| 5 | 100,000 | [`r5-100000-scroll-down.middle`](./render-results.json) | median 1.080 ms; p95 1.240; MAD 0.00404; 3 samples / 267 ops | median 6.853 ms; p95 8.350; MAD 0.04667; 3 samples / 42 ops |
| 5 | 100,000 | [`r5-100000-scroll-smooth.same-window`](./render-results.json) | median 0.40486 ms; p95 0.40744; MAD 0.00287; 3 samples / 748 ops | median 10.600 ms; p95 11.320; MAD 0.09000; 3 samples / 29 ops |
| 5 | 100,000 | [`r5-100000-scroll-right.top-left`](./render-results.json) | median 0.24415 ms; p95 0.26149; MAD 0.00202; 3 samples / 1203 ops | median 16.733 ms; p95 17.738; MAD 0.40476; 3 samples / 19 ops |
| 5 | 100,000 | [`r5-100000-edit-open.top-left`](./render-results.json) | median 0.94811 ms; p95 0.99931; MAD 0.05689; 3 samples / 375 ops | median 1.187 ms; p95 1.276; MAD 0.09884; 3 samples / 260 ops |
| 5 | 100,000 | [`r5-100000-edit-open.middle`](./render-results.json) | median 0.66867 ms; p95 0.72152; MAD 0.05394; 3 samples / 459 ops | median 1.030 ms; p95 1.035; MAD 0.00649; 3 samples / 293 ops |
| 5 | 100,000 | [`r5-100000-edit-open.bottom-right`](./render-results.json) | median 0.58655 ms; p95 0.60575; MAD 0.02133; 3 samples / 514 ops | median 1.447 ms; p95 1.882; MAD 0.00429; 3 samples / 192 ops |
| 5 | 100,000 | [`r5-100000-edit-commit.middle`](./render-results.json) | median 1.025 ms; p95 1.059; MAD 0.03699; 3 samples / 320 ops | median 7.846 ms; p95 8.165; MAD 0.00769; 3 samples / 39 ops |
| 5 | 100,000 | [`r5-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.073 ms; p95 2.376; MAD 0.32864; 3 samples / 149 ops | median 17.300 ms; p95 18.470; MAD 1.200; 3 samples / 19 ops |
| 5 | 100,000 | [`r5-100000-altering.remove-5-rows-top`](./render-results.json) | median 1.637 ms; p95 1.765; MAD 0.01452; 3 samples / 181 ops | median 14.814 ms; p95 15.187; MAD 0.18571; 3 samples / 21 ops |
| 5 | 100,000 | [`r5-100000-arrow-down.top-left`](./render-results.json) | median 0.69653 ms; p95 0.74695; MAD 0.02853; 3 samples / 431 ops | median 1.468 ms; p95 1.473; MAD 0.00541; 3 samples / 206 ops |
| 5 | 100,000 | [`r5-100000-arrow-right.middle`](./render-results.json) | median 0.72899 ms; p95 0.85031; MAD 0.02619; 3 samples / 397 ops | median 1.396 ms; p95 1.428; MAD 0.03560; 3 samples / 218 ops |
| 5 | 100,000 | [`r5-100000-formatted-paint.top-left`](./render-results.json) | median 0.00377 ms; p95 0.00401; MAD 0.00005; 3 samples / 78218 ops | median 6.469 ms; p95 7.380; MAD 0.32757; 3 samples / 49 ops |
| 5 | 100,000 | [`r5-100000-merge-heavy.paint`](./render-results.json) | median 0.00323 ms; p95 0.00522; MAD 0.00002; 3 samples / 80543 ops | median 6.419 ms; p95 6.458; MAD 0.04375; 3 samples / 48 ops |
| 6 | 100,000 | [`r6-100000-scroll-down.top-left`](./render-results.json) | median 1.411 ms; p95 1.469; MAD 0.06373; 3 samples / 229 ops | median 21.460 ms; p95 21.838; MAD 0.36000; 3 samples / 15 ops |
| 6 | 100,000 | [`r6-100000-scroll-down.middle`](./render-results.json) | median 1.235 ms; p95 1.245; MAD 0.01111; 3 samples / 252 ops | median 6.820 ms; p95 9.781; MAD 0.06000; 3 samples / 40 ops |
| 6 | 100,000 | [`r6-100000-scroll-smooth.same-window`](./render-results.json) | median 0.40241 ms; p95 0.42639; MAD 0.01292; 3 samples / 740 ops | median 10.510 ms; p95 10.591; MAD 0.08000; 3 samples / 30 ops |
| 6 | 100,000 | [`r6-100000-scroll-right.top-left`](./render-results.json) | median 0.25226 ms; p95 0.27553; MAD 0.01358; 3 samples / 1237 ops | median 16.643 ms; p95 17.549; MAD 0.31429; 3 samples / 20 ops |
| 6 | 100,000 | [`r6-100000-edit-open.top-left`](./render-results.json) | median 0.63171 ms; p95 0.64182; MAD 0.01124; 3 samples / 488 ops | median 1.178 ms; p95 1.346; MAD 0.08091; 3 samples / 251 ops |
| 6 | 100,000 | [`r6-100000-edit-open.middle`](./render-results.json) | median 0.63019 ms; p95 0.69419; MAD 0.00845; 3 samples / 474 ops | median 1.047 ms; p95 1.053; MAD 0.00681; 3 samples / 288 ops |
| 6 | 100,000 | [`r6-100000-edit-open.bottom-right`](./render-results.json) | median 0.57701 ms; p95 0.61783; MAD 0.03107; 3 samples / 520 ops | median 1.415 ms; p95 1.508; MAD 0.01272; 3 samples / 209 ops |
| 6 | 100,000 | [`r6-100000-edit-commit.middle`](./render-results.json) | median 1.032 ms; p95 1.099; MAD 0.07459; 3 samples / 310 ops | median 8.062 ms; p95 8.138; MAD 0.08462; 3 samples / 40 ops |
| 6 | 100,000 | [`r6-100000-altering.insert-5-rows-top`](./render-results.json) | median 1.948 ms; p95 2.190; MAD 0.26924; 3 samples / 162 ops | median 17.817 ms; p95 18.207; MAD 0.43333; 3 samples / 18 ops |
| 6 | 100,000 | [`r6-100000-altering.remove-5-rows-top`](./render-results.json) | median 1.624 ms; p95 1.639; MAD 0.01679; 3 samples / 187 ops | median 14.800 ms; p95 15.803; MAD 0.30000; 3 samples / 21 ops |
| 6 | 100,000 | [`r6-100000-arrow-down.top-left`](./render-results.json) | median 0.73603 ms; p95 0.77398; MAD 0.01445; 3 samples / 408 ops | median 1.487 ms; p95 1.656; MAD 0.05105; 3 samples / 198 ops |
| 6 | 100,000 | [`r6-100000-arrow-right.middle`](./render-results.json) | median 0.63758 ms; p95 0.79726; MAD 0.01195; 3 samples / 457 ops | median 1.385 ms; p95 1.433; MAD 0.03160; 3 samples / 219 ops |
| 6 | 100,000 | [`r6-100000-formatted-paint.top-left`](./render-results.json) | median 0.00358 ms; p95 0.00360; MAD 0.00000; 3 samples / 83574 ops | median 6.112 ms; p95 6.122; MAD 0.01176; 3 samples / 51 ops |
| 6 | 100,000 | [`r6-100000-merge-heavy.paint`](./render-results.json) | median 0.00327 ms; p95 0.00329; MAD 0.00002; 3 samples / 91752 ops | median 6.294 ms; p95 6.530; MAD 0.00000; 3 samples / 48 ops |
| 7 | 100,000 | [`r7-100000-scroll-down.top-left`](./render-results.json) | median 1.228 ms; p95 1.551; MAD 0.13457; 3 samples / 237 ops | median 21.400 ms; p95 21.814; MAD 0.46000; 3 samples / 15 ops |
| 7 | 100,000 | [`r7-100000-scroll-down.middle`](./render-results.json) | median 1.270 ms; p95 1.286; MAD 0.01788; 3 samples / 244 ops | median 6.867 ms; p95 9.278; MAD 0.17333; 3 samples / 41 ops |
| 7 | 100,000 | [`r7-100000-scroll-smooth.same-window`](./render-results.json) | median 0.40898 ms; p95 0.43338; MAD 0.01679; 3 samples / 731 ops | median 10.600 ms; p95 10.681; MAD 0.09000; 3 samples / 30 ops |
| 7 | 100,000 | [`r7-100000-scroll-right.top-left`](./render-results.json) | median 0.26693 ms; p95 0.27689; MAD 0.01107; 3 samples / 1220 ops | median 16.314 ms; p95 17.456; MAD 0.14286; 3 samples / 20 ops |
| 7 | 100,000 | [`r7-100000-edit-open.top-left`](./render-results.json) | median 0.63544 ms; p95 0.66414; MAD 0.03189; 3 samples / 482 ops | median 1.192 ms; p95 1.307; MAD 0.12807; 3 samples / 258 ops |
| 7 | 100,000 | [`r7-100000-edit-open.middle`](./render-results.json) | median 0.70140 ms; p95 0.83038; MAD 0.03848; 3 samples / 417 ops | median 1.072 ms; p95 1.127; MAD 0.06024; 3 samples / 288 ops |
| 7 | 100,000 | [`r7-100000-edit-open.bottom-right`](./render-results.json) | median 0.60482 ms; p95 0.62996; MAD 0.02793; 3 samples / 519 ops | median 1.444 ms; p95 1.576; MAD 0.04783; 3 samples / 206 ops |
| 7 | 100,000 | [`r7-100000-edit-commit.middle`](./render-results.json) | median 1.206 ms; p95 1.229; MAD 0.02575; 3 samples / 260 ops | median 7.800 ms; p95 8.105; MAD 0.20714; 3 samples / 40 ops |
| 7 | 100,000 | [`r7-100000-altering.insert-5-rows-top`](./render-results.json) | median 1.770 ms; p95 2.553; MAD 0.10018; 3 samples / 155 ops | median 17.633 ms; p95 18.818; MAD 1.317; 3 samples / 19 ops |
| 7 | 100,000 | [`r7-100000-altering.remove-5-rows-top`](./render-results.json) | median 1.697 ms; p95 1.900; MAD 0.10302; 3 samples / 180 ops | median 14.714 ms; p95 14.804; MAD 0.10000; 3 samples / 21 ops |
| 7 | 100,000 | [`r7-100000-arrow-down.top-left`](./render-results.json) | median 0.70775 ms; p95 0.71620; MAD 0.00000; 3 samples / 424 ops | median 1.421 ms; p95 1.479; MAD 0.04167; 3 samples / 212 ops |
| 7 | 100,000 | [`r7-100000-arrow-right.middle`](./render-results.json) | median 0.68889 ms; p95 0.80279; MAD 0.01889; 3 samples / 426 ops | median 1.373 ms; p95 1.385; MAD 0.01370; 3 samples / 221 ops |
| 7 | 100,000 | [`r7-100000-formatted-paint.top-left`](./render-results.json) | median 0.00383 ms; p95 0.00385; MAD 0.00003; 3 samples / 79171 ops | median 6.350 ms; p95 7.641; MAD 0.26176; 3 samples / 46 ops |
| 7 | 100,000 | [`r7-100000-merge-heavy.paint`](./render-results.json) | median 0.00329 ms; p95 0.00335; MAD 0.00000; 3 samples / 90663 ops | median 6.288 ms; p95 6.366; MAD 0.03125; 3 samples / 48 ops |
| 8 | 100,000 | [`r8-100000-scroll-down.top-left`](./render-results.json) | median 1.322 ms; p95 1.406; MAD 0.09312; 3 samples / 230 ops | median 21.380 ms; p95 21.578; MAD 0.22000; 3 samples / 15 ops |
| 8 | 100,000 | [`r8-100000-scroll-down.middle`](./render-results.json) | median 1.152 ms; p95 1.277; MAD 0.07000; 3 samples / 259 ops | median 7.193 ms; p95 8.339; MAD 0.25286; 3 samples / 41 ops |
| 8 | 100,000 | [`r8-100000-scroll-smooth.same-window`](./render-results.json) | median 0.41925 ms; p95 0.44855; MAD 0.01027; 3 samples / 706 ops | median 10.710 ms; p95 11.151; MAD 0.19000; 3 samples / 29 ops |
| 8 | 100,000 | [`r8-100000-scroll-right.top-left`](./render-results.json) | median 0.26176 ms; p95 0.27163; MAD 0.01097; 3 samples / 1334 ops | median 16.586 ms; p95 17.814; MAD 0.22857; 3 samples / 20 ops |
| 8 | 100,000 | [`r8-100000-edit-open.top-left`](./render-results.json) | median 0.63418 ms; p95 0.72717; MAD 0.03950; 3 samples / 463 ops | median 1.107 ms; p95 1.301; MAD 0.06284; 3 samples / 265 ops |
| 8 | 100,000 | [`r8-100000-edit-open.middle`](./render-results.json) | median 0.69172 ms; p95 0.78417; MAD 0.08871; 3 samples / 437 ops | median 1.051 ms; p95 1.290; MAD 0.02011; 3 samples / 269 ops |
| 8 | 100,000 | [`r8-100000-edit-open.bottom-right`](./render-results.json) | median 0.57444 ms; p95 0.63594; MAD 0.03808; 3 samples / 526 ops | median 1.437 ms; p95 1.462; MAD 0.01461; 3 samples / 210 ops |
| 8 | 100,000 | [`r8-100000-edit-commit.middle`](./render-results.json) | median 0.94505 ms; p95 1.049; MAD 0.10671; 3 samples / 326 ops | median 7.715 ms; p95 7.771; MAD 0.00769; 3 samples / 39 ops |
| 8 | 100,000 | [`r8-100000-altering.insert-5-rows-top`](./render-results.json) | median 1.872 ms; p95 1.977; MAD 0.11601; 3 samples / 168 ops | median 16.100 ms; p95 18.650; MAD 0.15714; 3 samples / 20 ops |
| 8 | 100,000 | [`r8-100000-altering.remove-5-rows-top`](./render-results.json) | median 1.573 ms; p95 1.643; MAD 0.01498; 3 samples / 190 ops | median 14.771 ms; p95 14.939; MAD 0.18571; 3 samples / 21 ops |
| 8 | 100,000 | [`r8-100000-arrow-down.top-left`](./render-results.json) | median 0.66291 ms; p95 0.73045; MAD 0.01453; 3 samples / 443 ops | median 1.496 ms; p95 1.501; MAD 0.00597; 3 samples / 204 ops |
| 8 | 100,000 | [`r8-100000-arrow-right.middle`](./render-results.json) | median 0.69444 ms; p95 0.79422; MAD 0.00746; 3 samples / 422 ops | median 1.404 ms; p95 1.422; MAD 0.01978; 3 samples / 216 ops |
| 8 | 100,000 | [`r8-100000-formatted-paint.top-left`](./render-results.json) | median 0.00373 ms; p95 0.00373; MAD 0.00000; 3 samples / 81346 ops | median 6.194 ms; p95 6.306; MAD 0.02353; 3 samples / 50 ops |
| 8 | 100,000 | [`r8-100000-merge-heavy.paint`](./render-results.json) | median 0.00326 ms; p95 0.00331; MAD 0.00003; 3 samples / 91777 ops | median 6.419 ms; p95 6.419; MAD 0.00000; 3 samples / 48 ops |
| 9 | 100,000 | [`r9-100000-scroll-down.top-left`](./render-results.json) | median 1.476 ms; p95 1.532; MAD 0.06141; 3 samples / 227 ops | median 21.040 ms; p95 21.418; MAD 0.36000; 3 samples / 15 ops |
| 9 | 100,000 | [`r9-100000-scroll-down.middle`](./render-results.json) | median 1.166 ms; p95 1.308; MAD 0.06524; 3 samples / 258 ops | median 6.787 ms; p95 9.859; MAD 0.03333; 3 samples / 40 ops |
| 9 | 100,000 | [`r9-100000-scroll-smooth.same-window`](./render-results.json) | median 0.39841 ms; p95 0.42397; MAD 0.01042; 3 samples / 744 ops | median 10.500 ms; p95 10.680; MAD 0.01000; 3 samples / 30 ops |
| 9 | 100,000 | [`r9-100000-scroll-right.top-left`](./render-results.json) | median 0.26481 ms; p95 0.30512; MAD 0.01147; 3 samples / 1134 ops | median 16.429 ms; p95 17.513; MAD 0.00000; 3 samples / 20 ops |
| 9 | 100,000 | [`r9-100000-edit-open.top-left`](./render-results.json) | median 0.81955 ms; p95 0.87214; MAD 0.05844; 3 samples / 459 ops | median 1.131 ms; p95 1.299; MAD 0.04329; 3 samples / 258 ops |
| 9 | 100,000 | [`r9-100000-edit-open.middle`](./render-results.json) | median 0.60361 ms; p95 0.66312; MAD 0.05002; 3 samples / 499 ops | median 1.048 ms; p95 1.058; MAD 0.01103; 3 samples / 290 ops |
| 9 | 100,000 | [`r9-100000-edit-open.bottom-right`](./render-results.json) | median 0.58256 ms; p95 0.62089; MAD 0.03281; 3 samples / 530 ops | median 1.500 ms; p95 1.658; MAD 0.03768; 3 samples / 196 ops |
| 9 | 100,000 | [`r9-100000-edit-commit.middle`](./render-results.json) | median 0.93925 ms; p95 1.171; MAD 0.05253; 3 samples / 304 ops | median 7.800 ms; p95 8.317; MAD 0.06154; 3 samples / 38 ops |
| 9 | 100,000 | [`r9-100000-altering.insert-5-rows-top`](./render-results.json) | median 1.983 ms; p95 2.157; MAD 0.19339; 3 samples / 161 ops | median 17.167 ms; p95 18.427; MAD 0.23333; 3 samples / 18 ops |
| 9 | 100,000 | [`r9-100000-altering.remove-5-rows-top`](./render-results.json) | median 1.717 ms; p95 1.780; MAD 0.05301; 3 samples / 176 ops | median 15.014 ms; p95 15.156; MAD 0.15714; 3 samples / 21 ops |
| 9 | 100,000 | [`r9-100000-arrow-down.top-left`](./render-results.json) | median 0.71348 ms; p95 0.74468; MAD 0.01417; 3 samples / 419 ops | median 1.496 ms; p95 1.684; MAD 0.01905; 3 samples / 194 ops |
| 9 | 100,000 | [`r9-100000-arrow-right.middle`](./render-results.json) | median 0.69514 ms; p95 0.76437; MAD 0.07692; 3 samples / 442 ops | median 1.377 ms; p95 1.400; MAD 0.00274; 3 samples / 218 ops |
| 9 | 100,000 | [`r9-100000-formatted-paint.top-left`](./render-results.json) | median 0.00369 ms; p95 0.00370; MAD 0.00001; 3 samples / 82246 ops | median 6.088 ms; p95 6.094; MAD 0.00588; 3 samples / 51 ops |
| 9 | 100,000 | [`r9-100000-merge-heavy.paint`](./render-results.json) | median 0.00322 ms; p95 0.00323; MAD 0.00001; 3 samples / 93586 ops | median 6.400 ms; p95 6.439; MAD 0.04375; 3 samples / 48 ops |
| 10 | 100,000 | [`r10-100000-scroll-down.top-left`](./render-results.json) | median 1.434 ms; p95 1.568; MAD 0.14853; 3 samples / 218 ops | median 21.320 ms; p95 22.004; MAD 0.66000; 3 samples / 15 ops |
| 10 | 100,000 | [`r10-100000-scroll-down.middle`](./render-results.json) | median 1.157 ms; p95 1.304; MAD 0.14737; 3 samples / 262 ops | median 6.800 ms; p95 8.278; MAD 0.10000; 3 samples / 43 ops |
| 10 | 100,000 | [`r10-100000-scroll-smooth.same-window`](./render-results.json) | median 0.39802 ms; p95 0.40454; MAD 0.00725; 3 samples / 755 ops | median 10.510 ms; p95 10.699; MAD 0.06000; 3 samples / 30 ops |
| 10 | 100,000 | [`r10-100000-scroll-right.top-left`](./render-results.json) | median 0.26848 ms; p95 0.27850; MAD 0.01113; 3 samples / 1166 ops | median 16.443 ms; p95 16.469; MAD 0.02857; 3 samples / 21 ops |
| 10 | 100,000 | [`r10-100000-edit-open.top-left`](./render-results.json) | median 0.88584 ms; p95 0.88823; MAD 0.00265; 3 samples / 404 ops | median 1.139 ms; p95 1.317; MAD 0.05584; 3 samples / 256 ops |
| 10 | 100,000 | [`r10-100000-edit-open.middle`](./render-results.json) | median 0.72886 ms; p95 0.76970; MAD 0.04538; 3 samples / 436 ops | median 1.061 ms; p95 1.104; MAD 0.04764; 3 samples / 288 ops |
| 10 | 100,000 | [`r10-100000-edit-open.bottom-right`](./render-results.json) | median 0.53351 ms; p95 0.56764; MAD 0.01216; 3 samples / 555 ops | median 1.440 ms; p95 1.627; MAD 0.01000; 3 samples / 201 ops |
| 10 | 100,000 | [`r10-100000-edit-commit.middle`](./render-results.json) | median 1.157 ms; p95 1.241; MAD 0.09312; 3 samples / 282 ops | median 7.831 ms; p95 7.942; MAD 0.12308; 3 samples / 40 ops |
| 10 | 100,000 | [`r10-100000-altering.insert-5-rows-top`](./render-results.json) | median 1.893 ms; p95 2.008; MAD 0.01391; 3 samples / 170 ops | median 16.300 ms; p95 18.295; MAD 0.35714; 3 samples / 20 ops |
| 10 | 100,000 | [`r10-100000-altering.remove-5-rows-top`](./render-results.json) | median 1.507 ms; p95 1.510; MAD 0.00299; 3 samples / 202 ops | median 15.200 ms; p95 15.534; MAD 0.37143; 3 samples / 21 ops |
| 10 | 100,000 | [`r10-100000-arrow-down.top-left`](./render-results.json) | median 0.75489 ms; p95 0.76639; MAD 0.01278; 3 samples / 407 ops | median 1.413 ms; p95 1.479; MAD 0.03185; 3 samples / 212 ops |
| 10 | 100,000 | [`r10-100000-arrow-right.middle`](./render-results.json) | median 0.70704 ms; p95 0.79577; MAD 0.06602; 3 samples / 440 ops | median 1.374 ms; p95 1.411; MAD 0.02127; 3 samples / 218 ops |
| 10 | 100,000 | [`r10-100000-formatted-paint.top-left`](./render-results.json) | median 0.00349 ms; p95 0.00403; MAD 0.00020; 3 samples / 83493 ops | median 6.159 ms; p95 7.684; MAD 0.02353; 3 samples / 47 ops |
| 10 | 100,000 | [`r10-100000-merge-heavy.paint`](./render-results.json) | median 0.00319 ms; p95 0.00325; MAD 0.00001; 3 samples / 93479 ops | median 6.369 ms; p95 6.403; MAD 0.03750; 3 samples / 49 ops |

## Reproduce

- `bun run --filter '@sheetwrite/bench' bench:render`
- `bun run --filter '@sheetwrite/bench' bench:render:smoke -- --engine sheetwrite`
- `bun run --filter '@sheetwrite/bench' bench:render:smoke -- --engine handsontable`

The JSON artifact is authoritative. This Markdown file is generated from it and must not be edited by hand.
