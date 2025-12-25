(function() {
    'use strict';

    // MSEDCL Tariff Slabs
    const TARIFF_SLABS = [
        { min: 0, max: 100, rate: 6.25 },
        { min: 101, max: 300, rate: 13.07 },
        { min: 301, max: 500, rate: 17.35 },
        { min: 501, max: 100000, rate: 19.65 }
    ];

    const ELECTRICITY_DUTY = 0.16;
    
    // Competitor VNM (Previously Koku) - Prepaid Plan
    const COMPETITOR_RATE_YEAR1 = 7.50;
    
    // NxTEnrgy - Subscription Plan
    const NXTENRGY_RATE = 5.50;
    const NXTENRGY_MAINTENANCE = 200;

    let debounceTimer = null;

    function sanitizeInput(input) {
        return String(input).replace(/[<>&'"]/g, function(c) {
            return {'<':'&lt;', '>':'&gt;', '&':'&amp;', "'":"&apos;", '"':'&quot;'}[c];
        });
    }

    function calculateBill(monthlyUnits) {
        let remainingUnits = monthlyUnits;
        let totalBill = 0;
        const breakdown = [];

        for (const slab of TARIFF_SLABS) {
            if (remainingUnits <= 0) break;

            const slabSize = slab.max - slab.min;
            const unitsInSlab = Math.min(remainingUnits, slabSize);
            const slabBill = unitsInSlab * slab.rate;

            breakdown.push({
                range: slab.min === 0 ? '1-' + slab.max : (slab.min + 1) + '-' + slab.max,
                rate: slab.rate,
                units: unitsInSlab,
                amount: slabBill
            });

            totalBill += slabBill;
            remainingUnits -= unitsInSlab;
        }

        const duty = totalBill * ELECTRICITY_DUTY;
        const finalBill = totalBill + duty;

        return { finalBill: finalBill, breakdown: breakdown, duty: duty };
    }

    function performCalculation() {
        const monthIds = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        const monthlyValues = monthIds.map(function(id) {
            const value = parseFloat(document.getElementById(id).value) || 0;
            return Math.max(0, value);
        });

        const totalAnnual = monthlyValues.reduce(function(a, b) { return a + b; }, 0);
        const avgMonthly = totalAnnual / 12;

        if (avgMonthly === 0) {
            document.getElementById('recommendationCard').style.display = 'none';
            document.getElementById('currentBill').textContent = '₹0';
            document.getElementById('kokuCost').textContent = '₹0';
            document.getElementById('newVendorCost').textContent = '₹0';
            document.getElementById('monthlySavings').textContent = '₹0';
            document.getElementById('slabBreakdown').innerHTML = '';
            return;
        }

        // 1. Calculate Baseline MSEDCL Bill
        const billResult = calculateBill(avgMonthly);
        const currentBill = billResult.finalBill;

        // 2. Compare Plans (Competitor VNM vs NxTEnrgy)
        // Competitor Prepaid: 7.50/unit
        const competitorFullCost = avgMonthly * COMPETITOR_RATE_YEAR1;

        // NxTEnrgy: 5.50/unit + 200 fixed
        const nxtEnrgyFullCost = (avgMonthly * NXTENRGY_RATE) + NXTENRGY_MAINTENANCE;

        // 3. Optimization Strategy (Keep first 100 units on Grid)
        let optGridUnits = 0;
        let optSubUnits = 0;

        if (avgMonthly <= 100) {
            optGridUnits = avgMonthly;
            optSubUnits = 0;
        } else {
            optGridUnits = 100;
            optSubUnits = avgMonthly - 100;
        }

        // Calculate "Smart Plan" Cost with NxTEnrgy
        const gridPortionBill = calculateBill(optGridUnits).finalBill;
        
        // Subscription part: Units * 5.5 + 200 Fixed
        const subPortionCost = (optSubUnits > 0) ? (optSubUnits * NXTENRGY_RATE) + NXTENRGY_MAINTENANCE : 0;
        
        const smartPlanTotalCost = gridPortionBill + subPortionCost;
        const monthlySavings = currentBill - smartPlanTotalCost;

        // 4. Update UI
        const recCard = document.getElementById('recommendationCard');
        if (avgMonthly > 100) {
            recCard.style.display = 'block';
            document.getElementById('optNewVendorUnits').textContent = Math.round(optSubUnits);
            document.getElementById('optGridUnits').textContent = Math.round(optGridUnits);
            document.getElementById('optTotalCost').textContent = '₹' + Math.round(smartPlanTotalCost).toLocaleString('en-IN');
        } else {
            recCard.style.display = 'none';
        }

        document.getElementById('currentBill').textContent = '₹' + Math.round(currentBill).toLocaleString('en-IN');
        document.getElementById('kokuCost').textContent = '₹' + Math.round(competitorFullCost).toLocaleString('en-IN');
        document.getElementById('newVendorCost').textContent = '₹' + Math.round(nxtEnrgyFullCost).toLocaleString('en-IN');
        document.getElementById('monthlySavings').textContent = '₹' + Math.round(monthlySavings).toLocaleString('en-IN');

        const tbody = document.getElementById('slabBreakdown');
        tbody.innerHTML = '';
        billResult.breakdown.forEach(function(slab) {
            const row = tbody.insertRow();
            row.innerHTML = '<td>' + sanitizeInput(slab.range) + '</td>' +
                           '<td>₹' + slab.rate.toFixed(2) + '</td>' +
                           '<td>' + Math.round(slab.units) + '</td>' +
                           '<td>₹' + Math.round(slab.amount).toLocaleString('en-IN') + '</td>';
        });
        const dutyRow = tbody.insertRow();
        dutyRow.innerHTML = '<td colspan="3"><strong>Electricity Duty (16%)</strong></td>' +
                           '<td><strong>₹' + Math.round(billResult.duty).toLocaleString('en-IN') + '</strong></td>';
    }

    function handleAutoFill() {
        const avgValue = parseFloat(document.getElementById('avgUnits').value) || 0;
        if (avgValue > 0) {
            const monthInputs = document.querySelectorAll('[data-month]');
            monthInputs.forEach(function(input) {
                input.value = avgValue;
            });
            performCalculation();
        }
    }

    function debouncedCalculation() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(performCalculation, 300);
    }

    document.addEventListener('input', function(e) {
        if (e.target.matches('[data-month]')) {
            debouncedCalculation();
        } else if (e.target.matches('[data-autofill]')) {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(handleAutoFill, 500);
        }
    });

    document.addEventListener('click', function(e) {
        const target = e.target.closest('[data-action]');
        if (target) {
            const action = target.dataset.action;
            if (action === 'guide') {
                document.getElementById('guideModal').showModal();
            } else if (action === 'closeModal') {
                document.getElementById('guideModal').close();
            }
        }
        const collapseTarget = e.target.closest('[data-collapse]');
        if (collapseTarget) {
            const collapseId = collapseTarget.dataset.collapse;
            const content = document.getElementById(collapseId);
            if (content) {
                content.classList.toggle('active');
            }
        }
    });

    const modal = document.getElementById('guideModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                this.close();
            }
        });
    }

    performCalculation();
    console.log('Solar Savings Calculator initialized ☀️ - NxTEnrgy vs Competitor VNM');
})();
