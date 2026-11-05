---
title: "Financial functions"
description: "Every financial formula function, its engine build, and its signature, semantic, dialect, and implementation profiles."
---

This page lists the 55 functions of the financial family. Taxonomy/source: [Financial functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb). The [formula function contract](/docs/reference/formula-functions/) has every family, the engine builds, and the evaluation limits.

## Functions

<FormulaReference>

<section class="sw-formula-family">

<table class="sw-formula-table"><thead><tr><th>Function (aliases)</th><th>Engine</th><th>Contract</th></tr></thead><tbody>
<tr data-formula-name="PV" data-engine="default"><td><code>PV</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-pv-fv-pmt">Signature: <code>pv-fv-pmt</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="FV" data-engine="default"><td><code>FV</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-pv-fv-pmt">Signature: <code>pv-fv-pmt</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="PMT" data-engine="default"><td><code>PMT</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-pv-fv-pmt">Signature: <code>pv-fv-pmt</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="NPV" data-engine="default"><td><code>NPV</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-npv">Signature: <code>npv</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="IRR" data-engine="default"><td><code>IRR</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-irr">Signature: <code>irr</code></a><br /><a href="#semantics-financial-iterative">Semantics: <code>financial-iterative</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="RATE" data-engine="default"><td><code>RATE</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-rate">Signature: <code>rate</code></a><br /><a href="#semantics-financial-iterative">Semantics: <code>financial-iterative</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="IPMT" data-engine="default"><td><code>IPMT</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-period-payment">Signature: <code>period-payment</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="PPMT" data-engine="default"><td><code>PPMT</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-period-payment">Signature: <code>period-payment</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="CUMIPMT" data-engine="full"><td><code>CUMIPMT</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-cumulative-payment">Signature: <code>cumulative-payment</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-finance">Implementation: <code>analysis-finance</code></a></details></td></tr>
<tr data-formula-name="CUMPRINC" data-engine="full"><td><code>CUMPRINC</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-cumulative-payment">Signature: <code>cumulative-payment</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-finance">Implementation: <code>analysis-finance</code></a></details></td></tr>
<tr data-formula-name="DB" data-engine="full"><td><code>DB</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-db">Signature: <code>db</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-finance">Implementation: <code>analysis-finance</code></a></details></td></tr>
<tr data-formula-name="DDB" data-engine="full"><td><code>DDB</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-ddb">Signature: <code>ddb</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-finance">Implementation: <code>analysis-finance</code></a></details></td></tr>
<tr data-formula-name="EFFECT" data-engine="full"><td><code>EFFECT</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-binary-number">Signature: <code>binary-number</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-finance">Implementation: <code>analysis-finance</code></a></details></td></tr>
<tr data-formula-name="FVSCHEDULE" data-engine="full"><td><code>FVSCHEDULE</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-fvschedule">Signature: <code>fvschedule</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-finance">Implementation: <code>analysis-finance</code></a></details></td></tr>
<tr data-formula-name="MIRR" data-engine="full"><td><code>MIRR</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-mirr">Signature: <code>mirr</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-finance">Implementation: <code>analysis-finance</code></a></details></td></tr>
<tr data-formula-name="NOMINAL" data-engine="full"><td><code>NOMINAL</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-binary-number">Signature: <code>binary-number</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-finance">Implementation: <code>analysis-finance</code></a></details></td></tr>
<tr data-formula-name="NPER" data-engine="full"><td><code>NPER</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-nper">Signature: <code>nper</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-finance">Implementation: <code>analysis-finance</code></a></details></td></tr>
<tr data-formula-name="PDURATION" data-engine="full"><td><code>PDURATION</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-pduration">Signature: <code>pduration</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-finance">Implementation: <code>analysis-finance</code></a></details></td></tr>
<tr data-formula-name="RRI" data-engine="full"><td><code>RRI</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-rri">Signature: <code>rri</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-finance">Implementation: <code>analysis-finance</code></a></details></td></tr>
<tr data-formula-name="SLN" data-engine="full"><td><code>SLN</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-sln">Signature: <code>sln</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-finance">Implementation: <code>analysis-finance</code></a></details></td></tr>
<tr data-formula-name="SYD" data-engine="full"><td><code>SYD</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-syd">Signature: <code>syd</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-finance">Implementation: <code>analysis-finance</code></a></details></td></tr>
<tr data-formula-name="XIRR" data-engine="full"><td><code>XIRR</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-xirr">Signature: <code>xirr</code></a><br /><a href="#semantics-financial-iterative">Semantics: <code>financial-iterative</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-finance">Implementation: <code>analysis-finance</code></a></details></td></tr>
<tr data-formula-name="XNPV" data-engine="full"><td><code>XNPV</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-xnpv">Signature: <code>xnpv</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-finance">Implementation: <code>analysis-finance</code></a></details></td></tr>
<tr data-formula-name="ACCRINT" data-engine="full"><td><code>ACCRINT</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-accrued-interest">Signature: <code>accrued-interest</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-securities">Implementation: <code>analysis-securities</code></a></details></td></tr>
<tr data-formula-name="ACCRINTM" data-engine="full"><td><code>ACCRINTM</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-accrued-at-maturity">Signature: <code>accrued-at-maturity</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-securities">Implementation: <code>analysis-securities</code></a></details></td></tr>
<tr data-formula-name="AMORDEGRC" data-engine="full"><td><code>AMORDEGRC</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-french-depreciation">Signature: <code>french-depreciation</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-depreciation">Implementation: <code>analysis-depreciation</code></a></details></td></tr>
<tr data-formula-name="AMORLINC" data-engine="full"><td><code>AMORLINC</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-french-depreciation">Signature: <code>french-depreciation</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-depreciation">Implementation: <code>analysis-depreciation</code></a></details></td></tr>
<tr data-formula-name="COUPDAYBS" data-engine="full"><td><code>COUPDAYBS</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-coupon">Signature: <code>coupon</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-securities">Implementation: <code>analysis-securities</code></a></details></td></tr>
<tr data-formula-name="COUPDAYS" data-engine="full"><td><code>COUPDAYS</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-coupon">Signature: <code>coupon</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-securities">Implementation: <code>analysis-securities</code></a></details></td></tr>
<tr data-formula-name="COUPDAYSNC" data-engine="full"><td><code>COUPDAYSNC</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-coupon">Signature: <code>coupon</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-securities">Implementation: <code>analysis-securities</code></a></details></td></tr>
<tr data-formula-name="COUPNCD" data-engine="full"><td><code>COUPNCD</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-coupon">Signature: <code>coupon</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-securities">Implementation: <code>analysis-securities</code></a></details></td></tr>
<tr data-formula-name="COUPNUM" data-engine="full"><td><code>COUPNUM</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-coupon">Signature: <code>coupon</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-securities">Implementation: <code>analysis-securities</code></a></details></td></tr>
<tr data-formula-name="COUPPCD" data-engine="full"><td><code>COUPPCD</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-coupon">Signature: <code>coupon</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-securities">Implementation: <code>analysis-securities</code></a></details></td></tr>
<tr data-formula-name="DISC" data-engine="full"><td><code>DISC</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-discount-security">Signature: <code>discount-security</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-securities">Implementation: <code>analysis-securities</code></a></details></td></tr>
<tr data-formula-name="DOLLARDE" data-engine="full"><td><code>DOLLARDE</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-dollar-fraction">Signature: <code>dollar-fraction</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-finance">Implementation: <code>analysis-finance</code></a></details></td></tr>
<tr data-formula-name="DOLLARFR" data-engine="full"><td><code>DOLLARFR</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-dollar-fraction">Signature: <code>dollar-fraction</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-finance">Implementation: <code>analysis-finance</code></a></details></td></tr>
<tr data-formula-name="DURATION" data-engine="full"><td><code>DURATION</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-bond-duration">Signature: <code>bond-duration</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-securities">Implementation: <code>analysis-securities</code></a></details></td></tr>
<tr data-formula-name="INTRATE" data-engine="full"><td><code>INTRATE</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-interest-rate">Signature: <code>interest-rate</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-securities">Implementation: <code>analysis-securities</code></a></details></td></tr>
<tr data-formula-name="ISPMT" data-engine="full"><td><code>ISPMT</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-interest-payment">Signature: <code>interest-payment</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-finance">Implementation: <code>analysis-finance</code></a></details></td></tr>
<tr data-formula-name="MDURATION" data-engine="full"><td><code>MDURATION</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-bond-duration">Signature: <code>bond-duration</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-securities">Implementation: <code>analysis-securities</code></a></details></td></tr>
<tr data-formula-name="ODDFPRICE" data-engine="full"><td><code>ODDFPRICE</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-odd-first-price">Signature: <code>odd-first-price</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-securities">Implementation: <code>analysis-securities</code></a></details></td></tr>
<tr data-formula-name="ODDFYIELD" data-engine="full"><td><code>ODDFYIELD</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-odd-first-yield">Signature: <code>odd-first-yield</code></a><br /><a href="#semantics-financial-iterative">Semantics: <code>financial-iterative</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-securities">Implementation: <code>analysis-securities</code></a></details></td></tr>
<tr data-formula-name="ODDLPRICE" data-engine="full"><td><code>ODDLPRICE</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-odd-last-price">Signature: <code>odd-last-price</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-securities">Implementation: <code>analysis-securities</code></a></details></td></tr>
<tr data-formula-name="ODDLYIELD" data-engine="full"><td><code>ODDLYIELD</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-odd-last-yield">Signature: <code>odd-last-yield</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-securities">Implementation: <code>analysis-securities</code></a></details></td></tr>
<tr data-formula-name="PRICE" data-engine="full"><td><code>PRICE</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-bond-price">Signature: <code>bond-price</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-securities">Implementation: <code>analysis-securities</code></a></details></td></tr>
<tr data-formula-name="PRICEDISC" data-engine="full"><td><code>PRICEDISC</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-price-discount">Signature: <code>price-discount</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-securities">Implementation: <code>analysis-securities</code></a></details></td></tr>
<tr data-formula-name="PRICEMAT" data-engine="full"><td><code>PRICEMAT</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-price-at-maturity">Signature: <code>price-at-maturity</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-securities">Implementation: <code>analysis-securities</code></a></details></td></tr>
<tr data-formula-name="RECEIVED" data-engine="full"><td><code>RECEIVED</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-received">Signature: <code>received</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-securities">Implementation: <code>analysis-securities</code></a></details></td></tr>
<tr data-formula-name="TBILLEQ" data-engine="full"><td><code>TBILLEQ</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-treasury-bill-discount">Signature: <code>treasury-bill-discount</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-securities">Implementation: <code>analysis-securities</code></a></details></td></tr>
<tr data-formula-name="TBILLPRICE" data-engine="full"><td><code>TBILLPRICE</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-treasury-bill-discount">Signature: <code>treasury-bill-discount</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-securities">Implementation: <code>analysis-securities</code></a></details></td></tr>
<tr data-formula-name="TBILLYIELD" data-engine="full"><td><code>TBILLYIELD</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-treasury-bill-yield">Signature: <code>treasury-bill-yield</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-securities">Implementation: <code>analysis-securities</code></a></details></td></tr>
<tr data-formula-name="VDB" data-engine="full"><td><code>VDB</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-vdb">Signature: <code>vdb</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-depreciation">Implementation: <code>analysis-depreciation</code></a></details></td></tr>
<tr data-formula-name="YIELD" data-engine="full"><td><code>YIELD</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-bond-yield">Signature: <code>bond-yield</code></a><br /><a href="#semantics-financial-iterative">Semantics: <code>financial-iterative</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-securities">Implementation: <code>analysis-securities</code></a></details></td></tr>
<tr data-formula-name="YIELDDISC" data-engine="full"><td><code>YIELDDISC</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-discount-security">Signature: <code>discount-security</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-securities">Implementation: <code>analysis-securities</code></a></details></td></tr>
<tr data-formula-name="YIELDMAT" data-engine="full"><td><code>YIELDMAT</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-yield-at-maturity">Signature: <code>yield-at-maturity</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-securities">Implementation: <code>analysis-securities</code></a></details></td></tr>
</tbody></table>

</section>

</FormulaReference>

## Signature profiles

Argument order, required/default state, accepted shapes, repetition, and return shape come directly from the inventory.

<details id="signature-pv-fv-pmt"><summary>Signature: pv-fv-pmt</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `rate` | yes | none | `scalar`, `reference` | `once` |
| `nper` | yes | none | `scalar`, `reference` | `once` |
| `paymentOrPresentValue` | yes | none | `scalar`, `reference` | `once` |
| `futureValue` | no | 0 | `scalar`, `reference` | `once` |
| `type` | no | 0 | `scalar`, `reference` | `once` |

</details>

<details id="signature-npv"><summary>Signature: npv</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `rate` | yes | none | `scalar`, `reference` | `once` |
| `value` | yes | none | `scalar`, `range`, `array`, `reference` | `one-or-more` |

</details>

<details id="signature-irr"><summary>Signature: irr</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `values` | yes | none | `range`, `array`, `reference` | `once` |
| `guess` | no | 0.1 | `scalar`, `reference` | `once` |

</details>

<details id="signature-rate"><summary>Signature: rate</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `nper` | yes | none | `scalar`, `reference` | `once` |
| `payment` | yes | none | `scalar`, `reference` | `once` |
| `presentValue` | yes | none | `scalar`, `reference` | `once` |
| `futureValue` | no | 0 | `scalar`, `reference` | `once` |
| `type` | no | 0 | `scalar`, `reference` | `once` |
| `guess` | no | 0.1 | `scalar`, `reference` | `once` |

</details>

<details id="signature-period-payment"><summary>Signature: period-payment</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `rate` | yes | none | `scalar`, `reference` | `once` |
| `period` | yes | none | `scalar`, `reference` | `once` |
| `nper` | yes | none | `scalar`, `reference` | `once` |
| `presentValue` | yes | none | `scalar`, `reference` | `once` |
| `futureValue` | no | 0 | `scalar`, `reference` | `once` |
| `type` | no | 0 | `scalar`, `reference` | `once` |

</details>

<details id="signature-cumulative-payment"><summary>Signature: cumulative-payment</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `rate` | yes | none | `scalar`, `reference` | `once` |
| `nper` | yes | none | `scalar`, `reference` | `once` |
| `presentValue` | yes | none | `scalar`, `reference` | `once` |
| `startPeriod` | yes | none | `scalar`, `reference` | `once` |
| `endPeriod` | yes | none | `scalar`, `reference` | `once` |
| `type` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-db"><summary>Signature: db</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `cost` | yes | none | `scalar`, `reference` | `once` |
| `salvage` | yes | none | `scalar`, `reference` | `once` |
| `life` | yes | none | `scalar`, `reference` | `once` |
| `period` | yes | none | `scalar`, `reference` | `once` |
| `month` | no | 12 | `scalar`, `reference` | `once` |

</details>

<details id="signature-ddb"><summary>Signature: ddb</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `cost` | yes | none | `scalar`, `reference` | `once` |
| `salvage` | yes | none | `scalar`, `reference` | `once` |
| `life` | yes | none | `scalar`, `reference` | `once` |
| `period` | yes | none | `scalar`, `reference` | `once` |
| `factor` | no | 2 | `scalar`, `reference` | `once` |

</details>

<details id="signature-binary-number"><summary>Signature: binary-number</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `number1` | yes | none | `scalar`, `reference` | `once` |
| `number2` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-fvschedule"><summary>Signature: fvschedule</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `principal` | yes | none | `scalar`, `reference` | `once` |
| `schedule` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |

</details>

<details id="signature-mirr"><summary>Signature: mirr</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `values` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `financeRate` | yes | none | `scalar`, `reference` | `once` |
| `reinvestRate` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-nper"><summary>Signature: nper</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `rate` | yes | none | `scalar`, `reference` | `once` |
| `payment` | yes | none | `scalar`, `reference` | `once` |
| `presentValue` | yes | none | `scalar`, `reference` | `once` |
| `futureValue` | no | 0 | `scalar`, `reference` | `once` |
| `type` | no | 0 | `scalar`, `reference` | `once` |

</details>

<details id="signature-pduration"><summary>Signature: pduration</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `rate` | yes | none | `scalar`, `reference` | `once` |
| `presentValue` | yes | none | `scalar`, `reference` | `once` |
| `futureValue` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-rri"><summary>Signature: rri</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `nper` | yes | none | `scalar`, `reference` | `once` |
| `presentValue` | yes | none | `scalar`, `reference` | `once` |
| `futureValue` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-sln"><summary>Signature: sln</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `cost` | yes | none | `scalar`, `reference` | `once` |
| `salvage` | yes | none | `scalar`, `reference` | `once` |
| `life` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-syd"><summary>Signature: syd</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `cost` | yes | none | `scalar`, `reference` | `once` |
| `salvage` | yes | none | `scalar`, `reference` | `once` |
| `life` | yes | none | `scalar`, `reference` | `once` |
| `period` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-xirr"><summary>Signature: xirr</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `values` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `dates` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `guess` | no | 0.1 | `scalar`, `reference` | `once` |

</details>

<details id="signature-xnpv"><summary>Signature: xnpv</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `rate` | yes | none | `scalar`, `reference` | `once` |
| `values` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `dates` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |

</details>

<details id="signature-accrued-interest"><summary>Signature: accrued-interest</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `issue` | yes | none | `scalar`, `reference` | `once` |
| `firstInterest` | yes | none | `scalar`, `reference` | `once` |
| `settlement` | yes | none | `scalar`, `reference` | `once` |
| `rate` | yes | none | `scalar`, `reference` | `once` |
| `par` | yes | none | `scalar`, `reference` | `once` |
| `frequency` | yes | none | `scalar`, `reference` | `once` |
| `basis` | no | 0 | `scalar`, `reference` | `once` |
| `calcMethod` | no | true | `scalar`, `reference` | `once` |

</details>

<details id="signature-accrued-at-maturity"><summary>Signature: accrued-at-maturity</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `issue` | yes | none | `scalar`, `reference` | `once` |
| `settlement` | yes | none | `scalar`, `reference` | `once` |
| `rate` | yes | none | `scalar`, `reference` | `once` |
| `par` | yes | none | `scalar`, `reference` | `once` |
| `basis` | no | 0 | `scalar`, `reference` | `once` |

</details>

<details id="signature-french-depreciation"><summary>Signature: french-depreciation</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `cost` | yes | none | `scalar`, `reference` | `once` |
| `datePurchased` | yes | none | `scalar`, `reference` | `once` |
| `firstPeriod` | yes | none | `scalar`, `reference` | `once` |
| `salvage` | yes | none | `scalar`, `reference` | `once` |
| `period` | yes | none | `scalar`, `reference` | `once` |
| `rate` | yes | none | `scalar`, `reference` | `once` |
| `basis` | no | 0 | `scalar`, `reference` | `once` |

</details>

<details id="signature-coupon"><summary>Signature: coupon</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `settlement` | yes | none | `scalar`, `reference` | `once` |
| `maturity` | yes | none | `scalar`, `reference` | `once` |
| `frequency` | yes | none | `scalar`, `reference` | `once` |
| `basis` | no | 0 | `scalar`, `reference` | `once` |

</details>

<details id="signature-discount-security"><summary>Signature: discount-security</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `settlement` | yes | none | `scalar`, `reference` | `once` |
| `maturity` | yes | none | `scalar`, `reference` | `once` |
| `price` | yes | none | `scalar`, `reference` | `once` |
| `redemption` | yes | none | `scalar`, `reference` | `once` |
| `basis` | no | 0 | `scalar`, `reference` | `once` |

</details>

<details id="signature-dollar-fraction"><summary>Signature: dollar-fraction</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `dollar` | yes | none | `scalar`, `reference` | `once` |
| `fraction` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-bond-duration"><summary>Signature: bond-duration</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `settlement` | yes | none | `scalar`, `reference` | `once` |
| `maturity` | yes | none | `scalar`, `reference` | `once` |
| `coupon` | yes | none | `scalar`, `reference` | `once` |
| `yield` | yes | none | `scalar`, `reference` | `once` |
| `frequency` | yes | none | `scalar`, `reference` | `once` |
| `basis` | no | 0 | `scalar`, `reference` | `once` |

</details>

<details id="signature-interest-rate"><summary>Signature: interest-rate</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `settlement` | yes | none | `scalar`, `reference` | `once` |
| `maturity` | yes | none | `scalar`, `reference` | `once` |
| `investment` | yes | none | `scalar`, `reference` | `once` |
| `redemption` | yes | none | `scalar`, `reference` | `once` |
| `basis` | no | 0 | `scalar`, `reference` | `once` |

</details>

<details id="signature-interest-payment"><summary>Signature: interest-payment</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `rate` | yes | none | `scalar`, `reference` | `once` |
| `period` | yes | none | `scalar`, `reference` | `once` |
| `nper` | yes | none | `scalar`, `reference` | `once` |
| `presentValue` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-odd-first-price"><summary>Signature: odd-first-price</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `settlement` | yes | none | `scalar`, `reference` | `once` |
| `maturity` | yes | none | `scalar`, `reference` | `once` |
| `issue` | yes | none | `scalar`, `reference` | `once` |
| `firstCoupon` | yes | none | `scalar`, `reference` | `once` |
| `rate` | yes | none | `scalar`, `reference` | `once` |
| `yield` | yes | none | `scalar`, `reference` | `once` |
| `redemption` | yes | none | `scalar`, `reference` | `once` |
| `frequency` | yes | none | `scalar`, `reference` | `once` |
| `basis` | no | 0 | `scalar`, `reference` | `once` |

</details>

<details id="signature-odd-first-yield"><summary>Signature: odd-first-yield</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `settlement` | yes | none | `scalar`, `reference` | `once` |
| `maturity` | yes | none | `scalar`, `reference` | `once` |
| `issue` | yes | none | `scalar`, `reference` | `once` |
| `firstCoupon` | yes | none | `scalar`, `reference` | `once` |
| `rate` | yes | none | `scalar`, `reference` | `once` |
| `price` | yes | none | `scalar`, `reference` | `once` |
| `redemption` | yes | none | `scalar`, `reference` | `once` |
| `frequency` | yes | none | `scalar`, `reference` | `once` |
| `basis` | no | 0 | `scalar`, `reference` | `once` |

</details>

<details id="signature-odd-last-price"><summary>Signature: odd-last-price</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `settlement` | yes | none | `scalar`, `reference` | `once` |
| `maturity` | yes | none | `scalar`, `reference` | `once` |
| `lastInterest` | yes | none | `scalar`, `reference` | `once` |
| `rate` | yes | none | `scalar`, `reference` | `once` |
| `yield` | yes | none | `scalar`, `reference` | `once` |
| `redemption` | yes | none | `scalar`, `reference` | `once` |
| `frequency` | yes | none | `scalar`, `reference` | `once` |
| `basis` | no | 0 | `scalar`, `reference` | `once` |

</details>

<details id="signature-odd-last-yield"><summary>Signature: odd-last-yield</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `settlement` | yes | none | `scalar`, `reference` | `once` |
| `maturity` | yes | none | `scalar`, `reference` | `once` |
| `lastInterest` | yes | none | `scalar`, `reference` | `once` |
| `rate` | yes | none | `scalar`, `reference` | `once` |
| `price` | yes | none | `scalar`, `reference` | `once` |
| `redemption` | yes | none | `scalar`, `reference` | `once` |
| `frequency` | yes | none | `scalar`, `reference` | `once` |
| `basis` | no | 0 | `scalar`, `reference` | `once` |

</details>

<details id="signature-bond-price"><summary>Signature: bond-price</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `settlement` | yes | none | `scalar`, `reference` | `once` |
| `maturity` | yes | none | `scalar`, `reference` | `once` |
| `rate` | yes | none | `scalar`, `reference` | `once` |
| `yield` | yes | none | `scalar`, `reference` | `once` |
| `redemption` | yes | none | `scalar`, `reference` | `once` |
| `frequency` | yes | none | `scalar`, `reference` | `once` |
| `basis` | no | 0 | `scalar`, `reference` | `once` |

</details>

<details id="signature-price-discount"><summary>Signature: price-discount</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `settlement` | yes | none | `scalar`, `reference` | `once` |
| `maturity` | yes | none | `scalar`, `reference` | `once` |
| `discount` | yes | none | `scalar`, `reference` | `once` |
| `redemption` | yes | none | `scalar`, `reference` | `once` |
| `basis` | no | 0 | `scalar`, `reference` | `once` |

</details>

<details id="signature-price-at-maturity"><summary>Signature: price-at-maturity</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `settlement` | yes | none | `scalar`, `reference` | `once` |
| `maturity` | yes | none | `scalar`, `reference` | `once` |
| `issue` | yes | none | `scalar`, `reference` | `once` |
| `rate` | yes | none | `scalar`, `reference` | `once` |
| `yield` | yes | none | `scalar`, `reference` | `once` |
| `basis` | no | 0 | `scalar`, `reference` | `once` |

</details>

<details id="signature-received"><summary>Signature: received</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `settlement` | yes | none | `scalar`, `reference` | `once` |
| `maturity` | yes | none | `scalar`, `reference` | `once` |
| `investment` | yes | none | `scalar`, `reference` | `once` |
| `discount` | yes | none | `scalar`, `reference` | `once` |
| `basis` | no | 0 | `scalar`, `reference` | `once` |

</details>

<details id="signature-treasury-bill-discount"><summary>Signature: treasury-bill-discount</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `settlement` | yes | none | `scalar`, `reference` | `once` |
| `maturity` | yes | none | `scalar`, `reference` | `once` |
| `discount` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-treasury-bill-yield"><summary>Signature: treasury-bill-yield</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `settlement` | yes | none | `scalar`, `reference` | `once` |
| `maturity` | yes | none | `scalar`, `reference` | `once` |
| `price` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-vdb"><summary>Signature: vdb</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `cost` | yes | none | `scalar`, `reference` | `once` |
| `salvage` | yes | none | `scalar`, `reference` | `once` |
| `life` | yes | none | `scalar`, `reference` | `once` |
| `startPeriod` | yes | none | `scalar`, `reference` | `once` |
| `endPeriod` | yes | none | `scalar`, `reference` | `once` |
| `factor` | no | 2 | `scalar`, `reference` | `once` |
| `noSwitch` | no | false | `scalar`, `reference` | `once` |

</details>

<details id="signature-bond-yield"><summary>Signature: bond-yield</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `settlement` | yes | none | `scalar`, `reference` | `once` |
| `maturity` | yes | none | `scalar`, `reference` | `once` |
| `rate` | yes | none | `scalar`, `reference` | `once` |
| `price` | yes | none | `scalar`, `reference` | `once` |
| `redemption` | yes | none | `scalar`, `reference` | `once` |
| `frequency` | yes | none | `scalar`, `reference` | `once` |
| `basis` | no | 0 | `scalar`, `reference` | `once` |

</details>

<details id="signature-yield-at-maturity"><summary>Signature: yield-at-maturity</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `settlement` | yes | none | `scalar`, `reference` | `once` |
| `maturity` | yes | none | `scalar`, `reference` | `once` |
| `issue` | yes | none | `scalar`, `reference` | `once` |
| `rate` | yes | none | `scalar`, `reference` | `once` |
| `price` | yes | none | `scalar`, `reference` | `once` |
| `basis` | no | 0 | `scalar`, `reference` | `once` |

</details>

## Semantic profiles

These values are normative for the listed Sheetwrite subset. `function-defined` and `contextual` are explicit limitations: consult the formula guides' function-specific sections rather than assuming another spreadsheet's edge behavior.

<details id="semantics-financial"><summary>Semantics: financial</summary>

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: contextual<br />array: contextual<br />broadcast: function-defined<br />result: scalar |
| coercion | blank: zero<br />text: number-if-parseable<br />boolean: number<br />error: propagate |
| text | case: not-applicable<br />wildcard: not-applicable |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: binary64<br />domain: bounded<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

</details>

<details id="semantics-financial-iterative"><summary>Semantics: financial-iterative</summary>

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: accepted<br />array: accepted<br />broadcast: none<br />result: scalar |
| coercion | blank: zero<br />text: number-if-parseable<br />boolean: number<br />error: propagate |
| text | case: not-applicable<br />wildcard: not-applicable |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: binary64<br />domain: bounded<br />iteration: kind: bounded<br />maximum: 100 |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

</details>

## Dialect profiles

<details id="dialect-excel-documented"><summary>Dialect: excel-documented</summary>

| Dialect | Status |
| --- | --- |
| Microsoft Excel | documented |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: Google Sheets and OpenFormula results require producer evidence before compatibility is claimed.

</details>

## Implementation profiles

<details id="implementation-implemented-assisted"><summary>Implementation: implemented-assisted</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/mod.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/eval/mod.rs)<br />[`packages/wasm/src/eval/functions.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/eval/functions.rs)<br />[`packages/wasm/src/eval/math.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/eval/math.rs)<br />[`packages/wasm/src/eval/math/trigonometry.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/eval/math/trigonometry.rs)<br />[`packages/wasm/src/eval/math/numerals.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/eval/math/numerals.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`packages/wasm/src/tests.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/tests.rs)<br />[`packages/core/test/formula-assist.test.ts`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/test/formula-assist.test.ts) |

</details>

<details id="implementation-analysis-finance"><summary>Implementation: analysis-finance</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/analysis/finance.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/eval/analysis/finance.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/develop/scripts/formula-contract.test.ts) |

</details>

<details id="implementation-analysis-securities"><summary>Implementation: analysis-securities</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/analysis/securities.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/eval/analysis/securities.rs)<br />[`packages/wasm/src/eval/analysis/securities/day_count.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/eval/analysis/securities/day_count.rs)<br />[`packages/wasm/src/eval/analysis/securities/odd.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/eval/analysis/securities/odd.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/develop/scripts/formula-contract.test.ts) |

</details>

<details id="implementation-analysis-depreciation"><summary>Implementation: analysis-depreciation</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/analysis/depreciation.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/eval/analysis/depreciation.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/develop/scripts/formula-contract.test.ts) |

</details>
