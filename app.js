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
    const NXTENRGY_RATE = 5.40;
    const NXTENRGY_MAINTENANCE = 200;

    let debounceTimer = null;

    // Sanitize input to prevent XSS
    function sanitizeInput(input) {
        return String(input).replace(/[<>&'"]/g, function(c) {
            return {'<':'&lt;', '>':'&gt;', '&':'&amp;', "'":"&#39;", '"':'&quot;'}[c];
        });
    }

    // Calculate MSEDCL bill based on slab structure
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

        return {
            finalBill: finalBill,
            breakdown: breakdown,
            duty: duty
        };
    }

    // Calculate 20-year cost schedule with 2% discount every 4 years
    function calculate20YearSchedule(avgMonthly) {
        const schedule = [];
        let currentRate = NXTENRGY_RATE;
        const baseMonthlyUnits = avgMonthly;
        const fixedMaintenance = NXTENRGY_MAINTENANCE;

        for (let year = 1; year <= 20; year++) {
            // Apply 2% discount at years 4, 8, 12, 16, 20
            if (year % 4 === 0) {
                currentRate = currentRate * 0.98;
            }
        
            const monthlyCost = (baseMonthlyUnits * currentRate) + fixedMaintenance;
            const annualCost = monthlyCost * 12;
            const discountApplied = (year % 4 === 0) ? '2% Discount' : '-';
        
            schedule.push({
                year: year,
                rate: currentRate,
                monthlyCost: monthlyCost,
                annualCost: annualCost,
                discountApplied: discountApplied
            });
        }


        return schedule;
    }

    // Main calculation function
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
            document.getElementById('schedule20YearSection').style.display = 'none';
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

        // NxTEnrgy: 5.40/unit + 200 fixed
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
        // Subscription part: Units * 5.4 + 200 Fixed
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

        // 5. Populate Slab Breakdown Table
        const tbody = document.getElementById('slabBreakdown');
        tbody.innerHTML = '';

        billResult.breakdown.forEach(function(slab) {
            const row = tbody.insertRow();
            row.innerHTML = '<td>' + slab.range + '</td>' +
                '<td>₹' + slab.rate.toFixed(2) + '</td>' +
                '<td>' + Math.round(slab.units) + '</td>' +
                '<td>₹' + Math.round(slab.amount).toLocaleString('en-IN') + '</td>';
        });

        // Add duty row
        const dutyRow = tbody.insertRow();
        dutyRow.innerHTML = '<td colspan="3"><strong>Electricity Duty (16%)</strong></td>' +
            '<td><strong>₹' + Math.round(billResult.duty).toLocaleString('en-IN') + '</strong></td>';
        dutyRow.style.borderTop = '2px solid #333';

        // 6. Calculate and display 20-year cost schedule
        const schedule20Year = calculate20YearSchedule(avgMonthly);
        const scheduleTableBody = document.getElementById('schedule20YearBody');
        scheduleTableBody.innerHTML = '';

        let totalCost20Year = 0;
        schedule20Year.forEach(function(item) {
            totalCost20Year += item.annualCost;
            const row = scheduleTableBody.insertRow();
            row.innerHTML = '<td>' + item.year + '</td>' +
                '<td>₹' + item.rate.toFixed(2) + '</td>' +
                '<td>₹' + Math.round(item.monthlyCost).toLocaleString('en-IN') + '</td>' +
                '<td>₹' + Math.round(item.annualCost).toLocaleString('en-IN') + '</td>' +
                '<td>' + (item.discountApplied !== '-' ? '<span class="tag-success">' + item.discountApplied + '</span>' : '-') + '</td>';

            // Highlight discount years with background color
            if (item.discountApplied !== '-') {
                row.style.background = '#FFF9E6';
            }
        });

        // Update summary values
        document.getElementById('initialRate20Year').textContent = '₹' + NXTENRGY_RATE.toFixed(2) + '/unit';
        document.getElementById('finalRate20Year').textContent = '₹' + schedule20Year[19].rate.toFixed(2) + '/unit';
        document.getElementById('totalCost20Year').textContent = '₹' + Math.round(totalCost20Year).toLocaleString('en-IN');

        // Show/hide the 20-year schedule section
        const schedule20YearSection = document.getElementById('schedule20YearSection');
        if (avgMonthly > 0) {
            schedule20YearSection.style.display = 'block';
        } else {
            schedule20YearSection.style.display = 'none';
        }
    }

    // Auto-fill handler with debounce
    function handleAutoFill(e) {
        const value = e.target.value;

        clearTimeout(debounceTimer);

        debounceTimer = setTimeout(function() {
            const monthIds = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
            monthIds.forEach(function(id) {
                document.getElementById(id).value = value;
            });
            performCalculation();
        }, 300);
    }

    // Initialize event listeners
    function init() {
        const monthIds = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

        monthIds.forEach(function(id) {
            const input = document.getElementById(id);
            input.addEventListener('input', performCalculation);
        });

        const autoFillInput = document.getElementById('autoFill');
        autoFillInput.addEventListener('input', handleAutoFill);

        // User name input (optional - just for display, not affecting calculations)
        const userNameInput = document.getElementById('userName');
        if (userNameInput) {
            userNameInput.addEventListener('input', function() {
                // Could be used for personalization or saving data
                console.log('User name:', userNameInput.value);
            });
        }

        // Initial calculation
        performCalculation();
    }

    // Toggle breakdown visibility
    window.toggleBreakdown = function() {
        const content = document.getElementById('breakdownContent');
        const icon = document.getElementById('toggleIcon');

        if (content.classList.contains('active')) {
            content.classList.remove('active');
            icon.textContent = '▼';
        } else {
            content.classList.add('active');
            icon.textContent = '▲';
        }
    };

    // Toggle 20-year schedule visibility
    window.toggleSchedule20Year = function() {
        const content = document.getElementById('schedule20YearContent');
        const icon = document.getElementById('scheduleToggleIcon');

        if (content.classList.contains('active')) {
            content.classList.remove('active');
            icon.textContent = '▼';
        } else {
            content.classList.add('active');
            icon.textContent = '▲';
        }
    };

    // Help dialog functions
    window.openHelp = function() {
        document.getElementById('helpDialog').showModal();
    };

    window.closeHelp = function() {
        document.getElementById('helpDialog').close();
    };

    // Start the app
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
