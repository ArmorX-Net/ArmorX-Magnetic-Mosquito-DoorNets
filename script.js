// ---------------------- Door Net Code with Invoice Integration ----------------------

// --- Load the size data from the JSON file ---
let sizeData;

// Fetch the JSON data and prevent caching issues
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

// --- Admin State and Key Listener ---
let isAdminVisible = false;
window.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.shiftKey && event.code === 'KeyU') {
        toggleAdminInterface();
    }
});

// ---------------------- Helper Functions ----------------------
function normalizeSizes(height, width, unit) {
    if (unit === 'Inch') return [height * 2.54, width * 2.54]; // Inches to cm
    if (unit === 'Feet') return [height * 30.48, width * 30.48]; // Feet to cm
    return [height, width]; // Already in cm
}

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
                    candidateHeight: candidateHeight,
                    candidateWidth: candidateWidth,
                    heightDiff: heightDiff,
                    widthDiff: widthDiff,
                    diff: diff
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
            const bestPreferred = preferredCandidates.reduce((acc, cur) => cur.diff < acc.diff ? cur : acc);
            return {
                match: bestPreferred.size,
                convertedSize: `${roundToNearestHalf(userHeight)} x ${roundToNearestHalf(userWidth)} cm`
            };
        } else {
            const bestAcceptable = acceptableCandidates.reduce((acc, cur) => cur.diff < acc.diff ? cur : acc);
            return {
                match: bestAcceptable.size,
                convertedSize: `${roundToNearestHalf(userHeight)} x ${roundToNearestHalf(userWidth)} cm`
            };
        }
    }
    return null;
}

function roundToNearestHalf(value) {
    return Math.round(value * 2) / 2;
}

function formatExactMatch(i, match, originalHeight, originalWidth, unit, color) {
    const originalSize = unit === 'Inch'
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

function formatClosestMatch(i, closestMatch, originalHeight, originalWidth, convertedSize, unit, color) {
    const [convertedHeight, convertedWidth] = convertedSize.split(' x ').map(parseFloat);
    const exceedsLimit = !(
        (convertedWidth <= 117 && convertedHeight <= 217) || 
        (convertedWidth <= 217 && convertedHeight <= 117)
    );

    if (exceedsLimit) {
        return `
            <div class="message info">
                <h3 style="font-weight: bold; color: black;">Door ${i}</h3>
                <h4>CLOSEST MATCH NOT FOUND: FREE Customization Available</h4>
                <p>Custom Size Needed (HxW): <strong>${originalHeight} x ${originalWidth} ${unit}</strong></p>
                ${convertedSize ? `<p>Custom Size Needed in Cm: <strong>${roundToNearestHalf(convertedHeight)} x ${roundToNearestHalf(convertedWidth)} Cm</strong></p>` : ''}
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
            ${showConvertedSize ? `<p style="margin: 0; padding-left: 10px; font-size: 14px;">= ${convertedSize}</p>` : ''}
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

// ---------------------- Global Invoice Variables & Fixed Price Constants ----------------------
// (Defined near the Admin Panel section for future edits/readability)
let doorOrderData = [];
const doorNetPrices = {
    "Selling Price": 880,
    "Deal Price": 826,
    "Event Price": 799
};

// ---------------------- Main Calculation Logic ----------------------
function calculateSizes() {
     // Hide the bottom WhatsApp icon once the calculation is initiated
    const supportIcon = document.querySelector('.whatsapp-icon-bottom');
    if (supportIcon) {
        supportIcon.style.display = 'none';
    }
    const unit = document.getElementById('unit').value;
    const numWindows = parseInt(document.getElementById('numWindows').value);
    const messageArea = document.getElementById('messageArea');
    let orderDetails = [];
    let isExceeded = false;
    messageArea.innerHTML = '';
    // Clear previous order data
    doorOrderData = [];

    for (let i = 1; i <= numWindows; i++) {
        const height = parseFloat(document.getElementById(`height${i}`).value);
        const width = parseFloat(document.getElementById(`width${i}`).value);
        const color = document.getElementById(`color${i}`).value.toUpperCase();

        if (!height || !width || height <= 0 || width <= 0) {
            messageArea.innerHTML += `<p class="error">Invalid dimensions for Door ${i}. Please enter valid values.</p>`;
            continue;
        }

        const [heightCm, widthCm] = normalizeSizes(height, width, unit);
        const exactMatch = findExactMatch(height, width, color, unit);
        if (exactMatch) {
            const match = exactMatch.match;
            const note = exactMatch.note || '';
            orderDetails.push(`Door ${i}: Exact Match Found: No Customization Needed
- Size: ${match['Size(HxW)']} ${match['Unit']}
- Color: ${getColorName(color)}
- Link: ${match['Amazon Link']}
${note}`);
            messageArea.innerHTML += formatExactMatch(i, match, height, width, unit, color);
            // Add structured order data for invoice generation using fixed prices
            doorOrderData.push({
                doorNumber: i,
                size: match['Size(HxW)'] || (match['Height(H)'] + ' x ' + match['Width(W)'] + ' ' + match['Unit']),
                priceRecord: doorNetPrices
            });
            continue;
        }

        const exceedsLimit = !(
            (widthCm <= 117 && heightCm <= 217) ||
            (widthCm <= 217 && heightCm <= 117)
        );
        if (exceedsLimit) {
            isExceeded = true;
            orderDetails.push(`Door ${i}: Size exceeds limit.
- Custom Size: ${height} x ${width} ${unit}
- Custom Size in Cm: ${roundToNearestHalf(heightCm)} x ${roundToNearestHalf(widthCm)} Cm
- Color: ${getColorName(color)}`);
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
            // Add structured order data for invoice generation using fixed prices
            doorOrderData.push({
                doorNumber: i,
                size: match['Height(H)'] + ' x ' + match['Width(W)'] + ' Cm',
                priceRecord: doorNetPrices
            });
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

// ---------------------- Invoice Generation Functions for Door Net Orders ----------------------
function generateInvoiceDoorNet() {
  if (!doorOrderData || doorOrderData.length === 0) {
    alert("No door order details found. Please run the calculator first.");
    return;
  }
  const adminMessageArea = document.getElementById('adminMessageArea');
  if (!adminMessageArea) return;

  let invoiceContainer = document.getElementById('invoiceControls');
  if (!invoiceContainer) {
    invoiceContainer = document.createElement('div');
    invoiceContainer.id = 'invoiceControls';
    invoiceContainer.style.display = 'flex';
    invoiceContainer.style.flexDirection = 'column';
    invoiceContainer.style.gap = '10px';
    invoiceContainer.style.marginBottom = '20px';
    adminMessageArea.appendChild(invoiceContainer);
  } else {
    invoiceContainer.innerHTML = '';
  }
  const priceSelection = document.createElement('select');
  priceSelection.id = 'priceSelection';
  priceSelection.innerHTML = `
    <option value="Selling Price">Selling Price</option>
    <option value="Deal Price">Deal Price</option>
    <option value="Event Price">Event Price</option>
  `;
  invoiceContainer.appendChild(priceSelection);
  const discountInput = document.createElement('input');
  discountInput.type = 'number';
  discountInput.id = 'discountInput';
  discountInput.placeholder = 'Enter Discount %';
  discountInput.min = '0';
  discountInput.max = '100';
  invoiceContainer.appendChild(discountInput);
  let qtyContainer = document.createElement('div');
  qtyContainer.id = 'qtyContainer';
  qtyContainer.style.display = 'flex';
  qtyContainer.style.flexDirection = 'column';
  qtyContainer.style.gap = '5px';
  qtyContainer.style.marginBottom = '10px';
  doorOrderData.forEach((item) => {
    let qtyDiv = document.createElement('div');
    qtyDiv.innerHTML = `Door ${item.doorNumber} Quantity: <input type="number" id="qty${item.doorNumber}" value="1" min="1" style="width:50px;">`;
    qtyContainer.appendChild(qtyDiv);
  });
  invoiceContainer.appendChild(qtyContainer);
  const generateBtn = document.createElement('button');
  generateBtn.className = 'admin-button';
  generateBtn.innerText = 'Generate Invoice';
  generateBtn.addEventListener('click', () => {
    const existingInvoice = document.getElementById('invoiceDisplay');
    if (existingInvoice) { existingInvoice.remove(); }
    displayInvoiceDoorNet(priceSelection.value, discountInput.value);
  });
  invoiceContainer.appendChild(generateBtn);
}

function displayInvoiceDoorNet(priceType, discountPercent) {
  let invoiceData = [];
  let totalAmount = 0;
  doorOrderData.forEach(item => {
    let qtyInput = document.getElementById(`qty${item.doorNumber}`);
    let qty = qtyInput ? parseInt(qtyInput.value) : 1;
    const price = parseFloat(item.priceRecord[priceType]);
    const doorTotal = price * qty;
    totalAmount += doorTotal;
    invoiceData.push(
      `Door ${item.doorNumber}\nSize: ${item.size} - ${qty} qty\nPrice: INR ${Math.round(price)}/- x ${qty} = INR ${Math.round(doorTotal)}/-`
    );
  });
  const discountAmount = (totalAmount * parseFloat(discountPercent || 0)) / 100;
  const finalAmount = totalAmount - discountAmount;
  let invoiceMessage = `<b>Invoice:</b>\n${invoiceData.join('\n\n')}\n\n<b>Total:</b> INR ${Math.round(totalAmount)}/-`;
  if (discountAmount > 0) {
    invoiceMessage += `\n<b>Discount (${discountPercent}%):</b> - INR ${Math.round(discountAmount)}/-`;
  }
  invoiceMessage += `\n<b>Final Total:</b> INR ${Math.round(finalAmount)}/-`;
  const invoiceDisplay = document.createElement('div');
  invoiceDisplay.id = 'invoiceDisplay';
  invoiceDisplay.style.marginTop = '20px';
  invoiceDisplay.innerHTML = `<pre>${invoiceMessage}</pre>`;
  const adminMessageArea = document.getElementById('adminMessageArea');
  adminMessageArea.appendChild(invoiceDisplay);
}

// ---------------------- Admin Panel ----------------------
function toggleAdminInterface() {
    isAdminVisible = !isAdminVisible;
    let adminContainer = document.getElementById('adminContainer');
    if (!adminContainer) {
        adminContainer = document.createElement('div');
        adminContainer.id = 'adminContainer';
        adminContainer.className = 'admin-panel';
        const adminTitle = document.createElement('h3');
        adminTitle.innerText = 'Admin Panel';
        adminTitle.style.textAlign = 'center';
        adminTitle.style.color = '#333';
        adminContainer.appendChild(adminTitle);
        const copyButton = document.createElement('button');
        copyButton.innerText = 'Copy Text';
        copyButton.className = 'admin-button';
        copyButton.addEventListener('click', copyAdminText);
        adminContainer.appendChild(copyButton);
        const formatButton = document.createElement('button');
        formatButton.innerText = 'Format Message for WhatsApp';
        formatButton.className = 'admin-button';
        formatButton.addEventListener('click', formatMessageForWhatsApp);
        adminContainer.appendChild(formatButton);
        // Add the Generate Invoice button for Door Net orders
        const invoiceButton = document.createElement('button');
        invoiceButton.innerText = 'Create Invoice';
        invoiceButton.className = 'admin-button';
        invoiceButton.addEventListener('click', generateInvoiceDoorNet);
        adminContainer.appendChild(invoiceButton);
        const adminMessageArea = document.createElement('div');
        adminMessageArea.id = 'adminMessageArea';
        adminMessageArea.className = 'admin-message-area';
        adminContainer.appendChild(adminMessageArea);
        document.body.appendChild(adminContainer);
    }
    adminContainer.style.display = isAdminVisible ? 'block' : 'none';
}

function copyAdminText() {
    const adminMessageArea = document.getElementById('adminMessageArea');
    if (adminMessageArea) {
        const textToCopy = adminMessageArea.innerText;
        navigator.clipboard.writeText(textToCopy)
            .then(() => alert('Text copied to clipboard!'))
            .catch((err) => {
                console.error('Error copying text: ', err);
                alert('Failed to copy text. Please try again.');
            });
    }
}

function formatMessageForWhatsApp() {
    const adminMessageArea = document.getElementById('adminMessageArea');
    if (calculatedOrderDetails.length === 0) {
        adminMessageArea.innerText = 'No calculated order details available. Please run the calculator first.';
    } else {
        const formattedMessage = calculatedOrderDetails.map((detail) => {
            const lines = detail.split('\n');
            let windowHeader = lines[0];
            let formattedLines = [];
            if (windowHeader.includes('Closest Match Found') || windowHeader.includes('Exact Match Found')) {
                windowHeader = windowHeader.split(':')[0] + ':';
            }
            if (lines.some(line => line.includes('Closest Match Found'))) {
                const customSizeDetail = lines.find(line => line.startsWith('- Custom Size Needed'));
                const customSizeInCm = lines.find(line => line.startsWith('- Custom Size in Cm'));
                const closestSizeDetail = lines.find(line => line.startsWith('- Closest Size Ordered'));
                const colorDetail = lines.find(line => line.startsWith('- Color'));
                const linkDetail = lines.find(line => line.startsWith('- Link'));
                let updatedClosestSizeDetail = null;
                if (closestSizeDetail) {
                    updatedClosestSizeDetail = closestSizeDetail.replace('Closest Size Ordered', 'Closest Size to Order');
                }
                formattedLines = [
                    windowHeader,
                    customSizeDetail,
                    customSizeInCm,
                    updatedClosestSizeDetail,
                    colorDetail,
                    'CLICK HERE: To Order *Closest Size* on Amazon:',
                    linkDetail
                ];
            } else if (lines.some(line => line.includes('Exact Match Found'))) {
                const sizeDetail = lines.find(line => line.startsWith('- Size:') || line.startsWith('- Size To Order'));
                const colorDetail = lines.find(line => line.startsWith('- Color'));
                const linkDetail = lines.find(line => line.startsWith('- Link'));
                const originalUnitNote = lines.find(line => line.includes('(Original:'));
                formattedLines = [
                    windowHeader,
                    originalUnitNote,
                    sizeDetail,
                    colorDetail,
                    'CLICK HERE: To Order *Exact Size* on Amazon:',
                    linkDetail
                ];
            }
            return formattedLines.filter(Boolean).join('\n');
        }).join('\n\n');
        adminMessageArea.innerText = formattedMessage;
    }
}

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

// Trigger shake animation on the bottom-right WhatsApp icon every 10 seconds
setInterval(() => {
  const icon = document.querySelector('.whatsapp-icon-bottom');
  if (icon) {
    icon.classList.add('shake');
    // Remove the shake class after the animation duration (0.5s)
    setTimeout(() => {
      icon.classList.remove('shake');
    }, 50);
  }
}, 1000);

function toggleFaq(faqElement) {
    const answer = faqElement.nextElementSibling;
    const isExpanded = answer.style.display === "block";
    document.querySelectorAll(".faq-answer").forEach((faq) => { faq.style.display = "none"; });
    document.querySelectorAll(".arrow").forEach((arrow) => { arrow.textContent = "▼"; });
    if (!isExpanded) {
        answer.style.display = "block";
        faqElement.querySelector(".arrow").textContent = "▲";
        const iframe = answer.querySelector("iframe");
        if (iframe && !iframe.src) {
            iframe.src = iframe.getAttribute("data-src");
        }
    }
}
