// Load the size data from the JSON file
let sizeData;
fetch('MQD_Sizes_Unit_Color_and_Links.json?v=' + new Date().getTime())
    .then(response => {
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
    })
    .then(data => {
        sizeData = data;
        console.log('Size data loaded successfully:', sizeData);
    })
    .catch(error => {
        document.getElementById('messageArea').innerHTML =
            '<p class="error">Failed to load size data. Please try again later.</p>';
        console.error('Error loading size data:', error);
    });

// Admin State
let isAdminVisible = false;

// Admin Key Combination Listener
window.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.shiftKey && event.code === 'KeyU') {
        toggleAdminInterface();
    }
});

// ----------------------
// GLOBAL VARIABLES
// ----------------------

// Global variables for admin panel messaging and invoice data.
let calculatedOrderDetails = []; // Populated during your calculation logic.
let orderData = []; // Each object: { doorNumber: 1, size: "210 x 115 cm" }

// Fixed Door Net Prices.
const DOOR_NET_PRICES = {
    "Selling Price": 880,
    "Deal Price": 826,
    "Event Price": 799
};

// Helper to get fixed door net price based on price type.
function getDoorNetPrice(priceType) {
    return DOOR_NET_PRICES[priceType] || 880;
}

// ----------------------
// HELPER FUNCTIONS
// ----------------------

// Normalize sizes based on input unit.
function normalizeSizes(height, width, unit) {
    if (unit === 'Inch') return [height * 2.54, width * 2.54]; // Inches to cm
    if (unit === 'Feet') return [height * 30.48, width * 30.48]; // Feet to cm
    return [height, width]; // Already in cm
}

// Get full color name.
function getColorName(colorCode) {
    switch (colorCode) {
        case 'BLACK':
            return 'Black';
        case 'GREY':
            return 'Grey';
        case 'BROWN':
            return 'Brown';
        default:
            return 'Unknown';
    }
}

// Find exact match.
function findExactMatch(height, width, color, unit) {
    let normalizedHeight, normalizedWidth;
    if (unit === 'Feet') {
        normalizedHeight = height;
        normalizedWidth = width;
        const exactMatchFeet = sizeData.find(size =>
            size['Unit'] === 'Feet' &&
            ((size['Height(H)'] === normalizedHeight && size['Width(W)'] === normalizedWidth) ||
             (size['Height(H)'] === normalizedWidth && size['Width(W)'] === normalizedHeight)) &&
            size['Color'].toUpperCase() === color
        );
        if (exactMatchFeet) {
            return { match: exactMatchFeet, note: null };
        }
    }
    if (unit === 'Inch') {
        const heightFeet = height / 12;
        const widthFeet = width / 12;
        const exactMatchFeet = sizeData.find(size =>
            size['Unit'] === 'Feet' &&
            ((size['Height(H)'] === heightFeet && size['Width(W)'] === widthFeet) ||
             (size['Height(H)'] === widthFeet && size['Width(W)'] === heightFeet)) &&
            size['Color'].toUpperCase() === color
        );
        if (exactMatchFeet) {
            return { match: exactMatchFeet, note: `(Original: ${height} x ${width} Inches, 12 Inches = 1 Foot)` };
        }
    }
    const [heightCm, widthCm] = normalizeSizes(height, width, unit);
    const exactMatchCm = sizeData.find(size =>
        size['Unit'] === 'cm' &&
        ((size['Height(H)'] === heightCm && size['Width(W)'] === widthCm) ||
         (size['Height(H)'] === widthCm && size['Width(W)'] === heightCm)) &&
        size['Color'].toUpperCase() === color
    );
    return exactMatchCm ? { match: exactMatchCm, note: null } : null;
}

// Find closest match with adjusted width rule and max 4cm difference.
function findClosestMatch(height, width, color, unit) {
    const [heightCm, widthCm] = normalizeSizes(height, width, unit);
    const userHeight = Math.max(heightCm, widthCm);
    const userWidth  = Math.min(heightCm, widthCm);

    let acceptableCandidates = [];
    let bestOverallDiff = Infinity;
    const filteredData = sizeData.filter(
        size => size['Unit'] === 'cm' && size['Color'].toUpperCase() === color
    );

    filteredData.forEach(size => {
        const dim1 = size['Height(H)'];
        const dim2 = size['Width(W)'];
        const permutations = [
            [dim1, dim2],
            [dim2, dim1]
        ];
        permutations.forEach(perm => {
            const candidateHeight = perm[0];
            const candidateWidth  = perm[1];
            const heightDiff = Math.abs(candidateHeight - userHeight);
            const widthDiff  = Math.abs(candidateWidth - userWidth);
            const diff = heightDiff + widthDiff;
            if (diff < bestOverallDiff) {
                bestOverallDiff = diff;
            }
            if (heightDiff <= 4 && widthDiff <= 4) {
                acceptableCandidates.push({
                    size: size,
                    candidateHeight,
                    candidateWidth,
                    heightDiff,
                    widthDiff,
                    diff
                });
            }
        });
    });

    if (acceptableCandidates.length > 0) {
        const preferredCandidates = acceptableCandidates.filter(cand => {
            if (cand.candidateWidth >= userWidth) return true;
            if ((userWidth - cand.candidateWidth) <= 1) return true;
            return false;
        });
        if (preferredCandidates.length > 0) {
            const bestPreferred = preferredCandidates.reduce((acc, cur) =>
                cur.diff < acc.diff ? cur : acc
            );
            return {
                match: bestPreferred.size,
                convertedSize: `${roundToNearestHalf(userHeight)} x ${roundToNearestHalf(userWidth)} cm`
            };
        } else {
            const bestAcceptable = acceptableCandidates.reduce((acc, cur) =>
                cur.diff < acc.diff ? cur : acc
            );
            return {
                match: bestAcceptable.size,
                convertedSize: `${roundToNearestHalf(userHeight)} x ${roundToNearestHalf(userWidth)} cm`
            };
        }
    }
    return null;
}

// Round to nearest 0.5.
function roundToNearestHalf(value) {
    return Math.round(value * 2) / 2;
}

// Format exact match result.
function formatExactMatch(i, match, originalHeight, originalWidth, unit, color) {
    const originalSize =
        unit === 'Inch'
            ? `${originalHeight} x ${originalWidth} Inches (12 Inches = 1 Foot)`
            : `${originalHeight} x ${originalWidth} ${unit}`;
    return `
        <div class="message success">
            <h3 style="font-weight: bold; color: black;">Door ${i}</h3>
            <h4>CONGRATULATIONS! YOUR EXACT SIZE IS AVAILABLE ✅</h4>
            <p>Size Needed (HxW): <strong>${originalSize}</strong></p>
            <p>Size To Order (HxW): <strong>${match['Height(H)']} x ${match['Width(W)']} ${match['Unit']}</strong></p>
            <p>Color: <strong>${getColorName(color)}</strong></p>
            <p>
                <br>
                <a href="${match['Amazon Link']}" target="_blank" style="color: green; font-weight: bold;">
                    CLICK HERE: To Order Directly on Amazon
                </a>
            </p>
        </div>
    `;
}

// Format closest match result.
function formatClosestMatch(i, closestMatch, originalHeight, originalWidth, convertedSize, unit, color) {
    const [convertedHeight, convertedWidth] = convertedSize.split(' x ').map(parseFloat);
    const exceedsLimit =
        !(
            (convertedWidth <= 117 && convertedHeight <= 217) ||
            (convertedWidth <= 217 && convertedHeight <= 117)
        );
    if (exceedsLimit) {
        return `
            <div class="message info">
                <h3 style="font-weight: bold; color: black;">Door ${i}</h3>
                <h4>CLOSEST MATCH NOT FOUND: FREE Customization Available</h4>
                <p>Custom Size Needed (HxW): <strong>${originalHeight} x ${originalWidth} ${unit}</strong></p>
                ${ convertedSize ? `<p>Custom Size Needed in Cm: <strong>${convertedHeight} x ${convertedWidth} Cm</strong></p>` : '' }
                <p>Color: <strong>${getColorName(color)}</strong></p>
                <p style="font-weight: bold; color: red; margin-top: 20px;">
                    This is X-Large size. Tap the WhatsApp icon below to share your customization request with Team ArmorX. Thanks!
                </p>
            </div>
        `;
    }
    const showConvertedSize = unit === 'Feet' || unit === 'Inch';
    return `
        <div class="message info">
            <h3 style="font-weight: bold; color: black;">Door ${i}</h3>
            <h4 style="font-weight: bold;">CLOSEST MATCH FOUND: ORDER Using Below Link</h4>
            <p style="margin: 0; font-size: 14px;">Custom Size Needed (HxW):</p>
            <p style="margin: 0; padding-left: 10px; font-size: 14px;">= ${originalHeight} x ${originalWidth} ${unit}</p>
            ${ showConvertedSize ? `<p style="margin: 0; padding-left: 10px; font-size: 14px;">= ${convertedSize}</p>` : '' }
            <br>
            <p style="margin: 0; font-size: 16px; font-weight: bold;">Closest Size To Order (HxW):</p>
            <p style="margin: 0; padding-left: 10px; font-size: 16px; font-weight: bold;">= ${closestMatch['Height(H)']} x ${closestMatch['Width(W)']} Cm</p>
            <br>
            <p style="margin: 0; font-size: 14px;">Color: <strong>${getColorName(color)}</strong></p>
            <p>
                <br>
                <a href="${closestMatch['Amazon Link']}" target="_blank" style="color: blue; font-weight: bold; font-size: 14px;">
                    CLICK HERE: To Order Closest Size on Amazon
                </a>
            </p>
            <p style="margin-top: 20px; font-weight: bold; font-size: 16px;">
                NEED HELP & SUPPORT:
            </p>
            <p style="margin: 0; font-size: 14px; font-weight: normal;">
                Tap the <img src="https://i.postimg.cc/mk19S9bF/whatsapp.png" alt="WhatsApp Icon" style="width: 18px; height: 18px; vertical-align: middle;"> WhatsApp button below to confirm your door size with Team ArmorX to make sure <strong>CLOSEST MATCH</strong> is a perfect fit for your door frame.
            </p>
            <br>
            <p style="font-size: 14px; font-weight: bold; color: #004085;">
                *CONFIRM YOUR CLOSEST SIZE WITH TEAM ARMORX ON
                <img src="https://i.postimg.cc/mk19S9bF/whatsapp.png" alt="WhatsApp Icon" style="width: 22px; height: 22px; vertical-align: middle;">*
            </p>
        </div>
    `;
}

// Generate a WhatsApp link with customization details.
function generateWhatsAppLink(orderDetails, isExceeded = false) {
    if (orderDetails.length === 0) return;
    let message;
    if (isExceeded) {
        message = `Hello Team ARMORX,\n\nMy Door size exceeds the standard size limit. Please assist me with the following details:\n\n${orderDetails.join('\n\n')}\n\nThank you.`;
    } else {
        message = `Hello Team ARMORX,\n\nPlease make note of my order:\n\n${orderDetails.join('\n\n')}\n\nThank you.`;
    }
    const whatsappLink = `https://wa.me/917304692553?text=${encodeURIComponent(message)}`;
    const messageArea = document.getElementById('messageArea');
    messageArea.innerHTML += `
        <div style="text-align: center; margin-top: 20px;">
            <a href="${whatsappLink}" target="_blank" class="whatsapp-button">
                <span style="flex-grow: 1; text-align: left;">(24/7)-SUPPORT: WHATSAPP YOUR DOOR FRAME SIZE TO TEAM ARMORX</span>
                <img src="https://i.postimg.cc/mk19S9bF/whatsapp.png" alt="WhatsApp Icon">
            </a>
        </div>
    `;
}

// ----------------------
// MAIN CALCULATION LOGIC
// ----------------------
function calculateSizes() {
    const unit = document.getElementById('unit').value;
    const numWindows = parseInt(document.getElementById('numWindows').value);
    const messageArea = document.getElementById('messageArea');
    let orderDetails = [];

    // Clear previous orderData and messages.
    orderData = [];
    messageArea.innerHTML = '';

    let isExceeded = false;
    for (let i = 1; i <= numWindows; i++) {
        const height = parseFloat(document.getElementById(`height${i}`).value);
        const width = parseFloat(document.getElementById(`width${i}`).value);
        const color = document.getElementById(`color${i}`).value.toUpperCase();
        if (!height || !width || height <= 0 || width <= 0) {
            messageArea.innerHTML += `<p class="error">Invalid dimensions for Door ${i}. Please enter valid values.</p>`;
            continue;
        }
        const [heightCm, widthCm] = normalizeSizes(height, width, unit);
        // Populate orderData.
        orderData.push({
            doorNumber: i,
            size: `${height} x ${width} ${unit}`
        });

        const exactMatch = findExactMatch(height, width, color, unit);
        if (exactMatch) {
            const match = exactMatch.match;
            const note = exactMatch.note || '';
            orderDetails.push(`Door ${i}: Exact Match Found: No Customization Needed\n- Size: ${match['Size(HxW)']} ${match['Unit']}\n- Color: ${getColorName(color)}\n- Link: ${match['Amazon Link']}\n${note}`);
            messageArea.innerHTML += formatExactMatch(i, match, height, width, unit, color);
            continue;
        }

        const exceedsLimit =
            !(
                (widthCm <= 117 && heightCm <= 217) ||
                (widthCm <= 217 && heightCm <= 117)
            );
        if (exceedsLimit) {
            isExceeded = true;
            orderDetails.push(`Door ${i}: Size exceeds limit.\n- Custom Size: ${height} x ${width} ${unit}\n- Custom Size in Cm: ${roundToNearestHalf(heightCm)} x ${roundToNearestHalf(widthCm)} Cm\n- Color: ${getColorName(color)}`);
            messageArea.innerHTML += `
                <div class="message info">
                    <h3 style="font-weight: bold; color: black;">Door ${i}</h3>
                    <h4>SIZE LIMIT EXCEEDED: CONTACT Team ArmorX</h4>
                    <p>Custom Size Needed (HxW): <strong>${height} x ${width} ${unit}</strong></p>
                    <p>Custom Size Needed in Cm: <strong>${roundToNearestHalf(heightCm)} x ${roundToNearestHalf(widthCm)} Cm</strong></p>
                    <p>Color: <strong>${getColorName(color)}</strong></p>
                    <p style="font-weight: bold; color: red; margin-top: 20px;">
                        This size exceeds the maximum allowable dimensions. Tap the WhatsApp icon below to share your customization request with Team ArmorX. Thanks!
                    </p>
                </div>
            `;
            continue;
        }

        const closestMatch = findClosestMatch(height, width, color, unit);
        if (closestMatch) {
            const match = closestMatch.match;
            const convertedSize = closestMatch.convertedSize;
            orderDetails.push(`Door ${i}: Closest Match Found: Customization Needed
- Custom Size Needed: ${height} x ${width} ${unit}
- Custom Size in Cm: ${convertedSize}
- Closest Size Ordered: ${match['Height(H)']} x ${match['Width(W)']} Cm
- Color: ${getColorName(color)}
- Link: ${match['Amazon Link']}`);
            messageArea.innerHTML += formatClosestMatch(i, match, height, width, convertedSize, unit, color);
        } else {
            orderDetails.push(`Door ${i}: No suitable match found.
Size needed: ${height} x ${width} ${unit}. 
Please WhatsApp your door size for a free customization request.`);
            messageArea.innerHTML += `<p class="error">
No suitable match found for Door ${i}.<br>
Size needed: ${height} x ${width} ${unit}.<br>
Tap the WhatsApp icon below to share your customization request with Team ArmorX. Thanks!
</p>`;
        }
    }
    calculatedOrderDetails = orderDetails;
    generateWhatsAppLink(orderDetails, isExceeded);
}

// ----------------------
// DYNAMIC INPUT FIELD GENERATION & PLACEHOLDER UPDATES
// ----------------------
document.getElementById('numWindows').addEventListener('input', function () {
    const numWindows = parseInt(this.value);
    const windowInputsDiv = document.getElementById('windowInputs');
    const selectedUnit = document.getElementById('unit').value;
    windowInputsDiv.innerHTML = '';
    if (!isNaN(numWindows) && numWindows > 0) {
        for (let i = 1; i <= numWindows; i++) {
            windowInputsDiv.innerHTML += `
                <div class="window-input">
                    <h3>Door ${i}</h3>
                    <label for="height${i}">Enter Height:</label>
                    <input type="number" id="height${i}" placeholder="Enter Height in ${selectedUnit}">
                    <label for="width${i}">Enter Width:</label>
                    <input type="number" id="width${i}" placeholder="Enter Width in ${selectedUnit}">
                    <label for="color${i}">Select Color:</label>
                    <select id="color${i}">
                        <option value="Black">Black</option>
                        <option value="Grey">Grey</option>
                        <option value="Brown">Brown</option>
                    </select>
                </div>
            `;
        }
        windowInputsDiv.style.display = 'block';
    } else {
        windowInputsDiv.style.display = 'none';
    }
});

document.getElementById('unit').addEventListener('change', function () {
    const selectedUnit = this.value;
    const numWindows = parseInt(document.getElementById('numWindows').value);
    for (let i = 1; i <= numWindows; i++) {
        const heightInput = document.getElementById(`height${i}`);
        const widthInput = document.getElementById(`width${i}`);
        if (heightInput) heightInput.placeholder = `Enter Height in ${selectedUnit}`;
        if (widthInput) widthInput.placeholder = `Enter Width in ${selectedUnit}`;
    }
});

// ----------------------
// FAQ TOGGLE LOGIC
// ----------------------
function toggleFaq(faqElement) {
    const answer = faqElement.nextElementSibling;
    const isExpanded = answer.style.display === "block";
    document.querySelectorAll(".faq-answer").forEach((faq) => {
        faq.style.display = "none";
    });
    document.querySelectorAll(".arrow").forEach((arrow) => {
        arrow.textContent = "▼";
    });
    if (!isExpanded) {
        answer.style.display = "block";
        faqElement.querySelector(".arrow").textContent = "▲";
        const iframe = answer.querySelector("iframe");
        if (iframe && !iframe.src) {
            iframe.src = iframe.getAttribute("data-src");
        }
    }
}

// ----------------------
// SHARE FUNCTIONALITY
// ----------------------
document.getElementById('shareButton').addEventListener('click', function () {
    const shareData = {
        title: 'ArmorX Magnetic Mosquito Door Net Calculator',
        text: "Hey look what I found! Try out this amazing ArmorX calculator to get a perfect fit magnetic Mosquito Door Net protection for your home. It's super easy to use! Check it out yourself.",
        url: 'https://armorx-net.github.io/ArmorX-Mosquito-Nets/'
    };
    if (navigator.share) {
        navigator.share(shareData)
            .then(() => console.log('Shared successfully'))
            .catch((err) => console.error('Error sharing:', err));
    } else {
        navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`)
            .then(() => alert('Link copied to clipboard! Share it manually.'))
            .catch((err) => console.error('Error copying link:', err));
    }
});
