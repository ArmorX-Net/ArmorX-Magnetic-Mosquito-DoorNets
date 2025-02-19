// Load the size data from the JSON file
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

// Admin State
let isAdminVisible = false;

// Admin Key Combination Listener
window.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.shiftKey && event.code === 'KeyU') {
        toggleAdminInterface();
    }
});


// Helper: Normalize sizes based on input unit
function normalizeSizes(height, width, unit) {
    if (unit === 'Inch') return [height * 2.54, width * 2.54]; // Inches to cm
    if (unit === 'Feet') return [height * 30.48, width * 30.48]; // Feet to cm
    return [height, width]; // Already in cm
}

// Helper: Get full color name
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

// Helper: Find exact match
function findExactMatch(height, width, color, unit) {
    let normalizedHeight, normalizedWidth;

    if (unit === 'Feet') {
        normalizedHeight = height; // Already in feet
        normalizedWidth = width;

        // Check for exact match in Feet
        const exactMatchFeet = sizeData.find(size =>
            size['Unit'] === 'Feet' &&
            ((size['Height(H)'] === normalizedHeight && size['Width(W)'] === normalizedWidth) ||
                (size['Height(H)'] === normalizedWidth && size['Width(W)'] === normalizedHeight)) &&
            size['Color'].toUpperCase() === color
        );

        if (exactMatchFeet) {
            return {
                match: exactMatchFeet,
                note: null,
            };
        }
    }

    if (unit === 'Inch') {
        const heightFeet = height / 12;
        const widthFeet = width / 12;

        // Check for exact match in Feet for Inches input
        const exactMatchFeet = sizeData.find(size =>
            size['Unit'] === 'Feet' &&
            ((size['Height(H)'] === heightFeet && size['Width(W)'] === widthFeet) ||
                (size['Height(H)'] === widthFeet && size['Width(W)'] === heightFeet)) &&
            size['Color'].toUpperCase() === color
        );

        if (exactMatchFeet) {
            return {
                match: exactMatchFeet,
                note: `(Original: ${height} x ${width} Inches, 12 Inches = 1 Foot)`,
            };
        }
    }

    // Convert to cm and check for exact match
    const [heightCm, widthCm] = normalizeSizes(height, width, unit);
    const exactMatchCm = sizeData.find(size =>
        size['Unit'] === 'cm' &&
        ((size['Height(H)'] === heightCm && size['Width(W)'] === widthCm) ||
            (size['Height(H)'] === widthCm && size['Width(W)'] === heightCm)) &&
        size['Color'].toUpperCase() === color
    );

    return exactMatchCm ? { match: exactMatchCm, note: null } : null;
}

// Helper: Find closest match in cm with adjusted width rule and max 4cm difference check
function findClosestMatch(height, width, color, unit) {
    const [heightCm, widthCm] = normalizeSizes(height, width, unit);
    // Standardize the dimensions: treat the larger as height and the smaller as width
    const userHeight = Math.max(heightCm, widthCm);
    const userWidth  = Math.min(heightCm, widthCm);

    let bestCandidateOverall = null;     // Best candidate regardless of 4cm rule
    let bestOverallDiff = Infinity;
    let bestCandidateAcceptable = null;    // Candidate with both differences <= 4 cm
    let bestAcceptableDiff = Infinity;

    // Filter candidates to those in cm and matching the color
    const filteredData = sizeData.filter(
        size => size['Unit'] === 'cm' && size['Color'].toUpperCase() === color
    );

    filteredData.forEach(size => {
        const dim1 = size['Height(H)'];
        const dim2 = size['Width(W)'];
        // Check both possible assignments of dimensions
        const permutations = [
            [dim1, dim2],
            [dim2, dim1]
        ];

        permutations.forEach(perm => {
            const candidateHeight = perm[0];
            const candidateWidth = perm[1];

            // Enforce the width rule:
            // If the user's width is greater than the candidate's width by more than 1cm, skip this permutation.
            if (userWidth > candidateWidth && (userWidth - candidateWidth) > 1) {
                return;
            }

            // Calculate individual differences and total difference
            const heightDiff = Math.abs(candidateHeight - userHeight);
            const widthDiff = Math.abs(candidateWidth - userWidth);
            const diff = heightDiff + widthDiff;

            // Update the overall best candidate (ignoring the 4cm rule)
            if (diff < bestOverallDiff) {
                bestOverallDiff = diff;
                bestCandidateOverall = {
                    size: size,
                    candidateHeight: candidateHeight,
                    candidateWidth: candidateWidth,
                    heightDiff: heightDiff,
                    widthDiff: widthDiff,
                    diff: diff
                };
            }

            // If both differences are within 4 cm, consider it as acceptable.
            if (heightDiff <= 4 && widthDiff <= 4) {
                if (diff < bestAcceptableDiff) {
                    bestAcceptableDiff = diff;
                    bestCandidateAcceptable = {
                        size: size,
                        candidateHeight: candidateHeight,
                        candidateWidth: candidateWidth,
                        heightDiff: heightDiff,
                        widthDiff: widthDiff,
                        diff: diff
                    };
                }
            }
        });
    });

    // If an acceptable candidate is found, return it.
    if (bestCandidateAcceptable) {
        return {
            match: bestCandidateAcceptable.size,
            convertedSize: `${roundToNearestHalf(userHeight)} x ${roundToNearestHalf(userWidth)} cm`
        };
    }

    // No acceptable candidate found (i.e. even the best candidate has a >4cm difference)
    // Returning null will trigger the exceed size logic in calculateSizes().
    return null;
}

// Helper: Round to nearest 0.5
function roundToNearestHalf(value) {
    return Math.round(value * 2) / 2;
}

// Helper: Format results for exact match
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

// Helper: Format results for closest match
function formatClosestMatch(i, closestMatch, originalHeight, originalWidth, convertedSize, unit, color) {
    // Parse the converted size to extract dimensions in cm
    const [convertedHeight, convertedWidth] = convertedSize.split(' x ').map(parseFloat);

    // Check if the size exceeds maximum allowable limits with interchangeability
    const exceedsLimit =
        !(
            (convertedWidth <= 117 && convertedHeight <= 217) || // Width ≤ 117, Height ≤ 217
            (convertedWidth <= 217 && convertedHeight <= 117)    // Width ≤ 217, Height ≤ 117
        );

    if (exceedsLimit) {
        // If the size exceeds the limit, show a message without an Amazon link
        return `
            <div class="message info">
                <h3 style="font-weight: bold; color: black;">Door ${i}</h3>
                <h4>CLOSEST MATCH NOT FOUND: FREE Customization Available</h4>
                <p>Custom Size Needed (HxW): <strong>${originalHeight} x ${originalWidth} ${unit}</strong></p>
                ${
                    convertedSize
                        ? `<p>Custom Size Needed in Cm: <strong>${convertedHeight} x ${convertedWidth} Cm</strong></p>`
                        : ''
                }
                <p>Color: <strong>${getColorName(color)}</strong></p>
                <p style="font-weight: bold; color: red; margin-top: 20px;">
                    This is X-Large size. Tap the WhatsApp icon below to share your customization request with Team ArmorX. Thanks!
                </p>
            </div>
        `;
    }

    // Regular closest match recommendation
    
   // Determine if converted size is needed (only for feet or inches)
    const showConvertedSize = unit === 'Feet' || unit === 'Inch';

    return `
        <div class="message info">
            <h3 style="font-weight: bold; color: black;">Door ${i}</h3>
            <h4 style="font-weight: bold;">CLOSEST MATCH FOUND:ORDER Using Below Link</h4>
            
            <!-- Custom Size Needed Section -->
            <p style="margin: 0; font-size: 14px;">Custom Size Needed (HxW):</p>
            <p style="margin: 0; padding-left: 10px; font-size: 14px;">= ${originalHeight} x ${originalWidth} ${unit}</p>
            ${
                showConvertedSize
                    ? `<p style="margin: 0; padding-left: 10px; font-size: 14px;">= ${convertedSize}</p>`
                    : ''
            }
            <br> <!-- Add a line break for spacing -->

            <!-- Closest Size To Order Section -->
            <p style="margin: 0; font-size: 16px; font-weight: bold;">Closest Size To Order (HxW):</p>
            <p style="margin: 0; padding-left: 10px; font-size: 16px; font-weight: bold;">= ${closestMatch['Height(H)']} x ${closestMatch['Width(W)']} Cm</p>
            <br> <!-- Add a line break for spacing -->

            <!-- Color Section -->
            <p style="margin: 0; font-size: 14px;">Color: <strong>${getColorName(color)}</strong></p>
            
            <!-- Amazon Link -->
            <p>
                <br>
                <a href="${closestMatch['Amazon Link']}" target="_blank" style="color: blue; font-weight: bold; font-size: 14px;">
                    CLICK HERE: To Order Closest Size on Amazon
                </a>
            </p>
            
            <!-- Next Steps Section -->
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

// Generate a WhatsApp link with customization details
function generateWhatsAppLink(orderDetails, isExceeded = false) {
    if (orderDetails.length === 0) return;

    // Check if the size exceeds the limit and customize the message
    let message;
    if (isExceeded) {
        message = `Hello Team ARMORX,\n\nMy Door size exceeds the standard size limit. I need help with customization. Please assist me with the following details:\n\n${orderDetails.join('\n\n')}\n\nThank you.`;
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

// Main calculation logic
function calculateSizes() {
    const unit = document.getElementById('unit').value;
    const numWindows = parseInt(document.getElementById('numWindows').value);
    const messageArea = document.getElementById('messageArea');
    let orderDetails = []; // Temporary array for current calculation

    let isExceeded = false; // Flag to check if size exceeds the limit

    messageArea.innerHTML = ''; // Clear previous messages

    for (let i = 1; i <= numWindows; i++) {
        const height = parseFloat(document.getElementById(`height${i}`).value);
        const width = parseFloat(document.getElementById(`width${i}`).value);
        const color = document.getElementById(`color${i}`).value.toUpperCase();

        if (!height || !width || height <= 0 || width <= 0) {
            messageArea.innerHTML += `<p class="error">Invalid dimensions for Door ${i}. Please enter valid values.</p>`;
            continue;
        }

        // Normalize the size to cm
        const [heightCm, widthCm] = normalizeSizes(height, width, unit);

        // Check for exact match first
        const exactMatch = findExactMatch(height, width, color, unit);
        if (exactMatch) {
            const match = exactMatch.match;
            const note = exactMatch.note || '';
            orderDetails.push(`Door ${i}: Exact Match Found: No Customization Needed\n- Size: ${match['Size(HxW)']} ${match['Unit']}\n- Color: ${getColorName(color)}\n- Link: ${match['Amazon Link']}\n${note}`);
            messageArea.innerHTML += formatExactMatch(i, match, height, width, unit, color);
            continue; // Skip the rest of the logic for this Door
        }

        // Only check for dimensions exceeding limits during closest match
        const exceedsLimit =
            !(
                (widthCm <= 117 && heightCm <= 217) || 
                (widthCm <= 217 && heightCm <= 117)
            );

        if (exceedsLimit) {
            isExceeded = true; // Set the flag to true
            orderDetails.push(`Door ${i}: Size exceeds limit.\n- Custom Size: ${height} x ${width} ${unit}\n- Custom Size in Cm: ${roundToNearestHalf(heightCm)} x ${roundToNearestHalf(widthCm)} Cm\n- Color: ${getColorName(color)}`);
            messageArea.innerHTML += `
                <div class="message info">
                    <h3 style="font-weight: bold; color: black;">Door ${i}</h3>
                    <h4>SIZE LIMIT EXCEEDED: FREE Customization Available</h4>
                    <p>Custom Size Needed (HxW): <strong>${height} x ${width} ${unit}</strong></p>
                    <p>Custom Size Needed in Cm: <strong>${roundToNearestHalf(heightCm)} x ${roundToNearestHalf(widthCm)} Cm</strong></p>
                    <p>Color: <strong>${getColorName(color)}</strong></p>
                    <p style="font-weight: bold; color: red; margin-top: 20px;">
                        This size exceeds the maximum allowable dimensions. Tap the WhatsApp icon below to share your customization request with Team ArmorX. Thanks!
                    </p>
                </div>
            `;
            continue; // Skip finding closest match
        }

        // Find closest match
        const closestMatch = findClosestMatch(height, width, color, unit);
        if (closestMatch) {
            const match = closestMatch.match;
            const convertedSize = closestMatch.convertedSize;
            orderDetails.push(`Door ${i}: Closest Match Found: Customization Needed\n- Custom Size Needed: ${height} x ${width} ${unit}\n- Custom Size in Cm: ${convertedSize}\n- Closest Size Ordered: ${match['Height(H)']} x ${match['Width(W)']} Cm\n- Color: ${getColorName(color)}\n- Link: ${match['Amazon Link']}`);
            messageArea.innerHTML += formatClosestMatch(i, match, height, width, convertedSize, unit, color);
        } else {
            messageArea.innerHTML += `<p class="error">No suitable match found for Door ${i}.</p>`;
        }
    }

    // Store the calculated details for admin access
    calculatedOrderDetails = orderDetails;

    // Pass the `isExceeded` flag to the WhatsApp link generator
    generateWhatsAppLink(orderDetails, isExceeded);
}

// Dynamic input field generation for Doors
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

// Dynamic placeholder updates when the unit changes
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

// FAQ Toggle Logic
function toggleFaq(faqElement) {
    const answer = faqElement.nextElementSibling;
    const isExpanded = answer.style.display === "block";

    // Collapse all other FAQs
    document.querySelectorAll(".faq-answer").forEach((faq) => {
        faq.style.display = "none";
    });
    document.querySelectorAll(".arrow").forEach((arrow) => {
        arrow.textContent = "▼";
    });

    // Expand the selected FAQ if it wasn't already expanded
    if (!isExpanded) {
        answer.style.display = "block";
        faqElement.querySelector(".arrow").textContent = "▲";

        // Lazy load the video if it's not already loaded
        const iframe = answer.querySelector("iframe");
        if (iframe && !iframe.src) {
            iframe.src = iframe.getAttribute("data-src");
        }
    }
}

// Admin Panel
function toggleAdminInterface() {
    isAdminVisible = !isAdminVisible;

    let adminContainer = document.getElementById('adminContainer');
    if (!adminContainer) {
        // Create Admin Container if not exists
        adminContainer = document.createElement('div');
        adminContainer.id = 'adminContainer';
        adminContainer.className = 'admin-panel'; // Use CSS class for styling

        // Add a title
        const adminTitle = document.createElement('h3');
        adminTitle.innerText = 'Admin Panel';
        adminTitle.style.textAlign = 'center';
        adminTitle.style.color = '#333';
        adminContainer.appendChild(adminTitle);

        // Add Copy Button
        const copyButton = document.createElement('button');
        copyButton.innerText = 'Copy Text';
        copyButton.className = 'admin-button'; // Use CSS class for buttons
        copyButton.addEventListener('click', copyAdminText);
        adminContainer.appendChild(copyButton);

        // Add Format Message for WhatsApp Button
        const formatButton = document.createElement('button');
        formatButton.innerText = 'Format Message for WhatsApp';
        formatButton.className = 'admin-button'; // Use CSS class for buttons
        formatButton.addEventListener('click', formatMessageForWhatsApp);
        adminContainer.appendChild(formatButton);

        // Add Message Display Area
        const adminMessageArea = document.createElement('div');
        adminMessageArea.id = 'adminMessageArea';
        adminMessageArea.className = 'admin-message-area'; // Use CSS class for message area
        adminContainer.appendChild(adminMessageArea);

        document.body.appendChild(adminContainer);
    }

    adminContainer.style.display = isAdminVisible ? 'block' : 'none';
}

// Function to Copy text from Admin Panel
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

// Function to Format Message for WhatsApp Admin Panel
function formatMessageForWhatsApp() {
    const adminMessageArea = document.getElementById('adminMessageArea');

    // Use the dynamically calculated orderDetails
    if (calculatedOrderDetails.length === 0) {
        adminMessageArea.innerText = 'No calculated order details available. Please run the calculator first.';
    } else {
        // Generate a simplified message format for the admin panel
        const formattedMessage = calculatedOrderDetails.map((detail) => {
            const lines = detail.split('\n');
            let windowHeader = lines[0]; // Example: "Door 1:"
            let formattedLines = [];

            // Remove unnecessary match type text after the header
            if (windowHeader.includes('Closest Match Found') || windowHeader.includes('Exact Match Found')) {
                windowHeader = windowHeader.split(':')[0] + ':'; // Retain only "Window X:"
            }

            // Process the remaining lines for closest or exact matches
            if (lines.some(line => line.includes('Closest Match Found'))) {
                const customSizeDetail = lines.find(line => line.startsWith('- Custom Size Needed'));
                const customSizeInCm = lines.find(line => line.startsWith('- Custom Size in Cm'));
                const closestSizeDetail = lines.find(line => line.startsWith('- Closest Size Ordered'));
                const colorDetail = lines.find(line => line.startsWith('- Color'));
                const linkDetail = lines.find(line => line.startsWith('- Link'));

    // Replace "Closest Size Ordered" with "Closest Size to Order"
    let updatedClosestSizeDetail = null;
    if (closestSizeDetail) {
        updatedClosestSizeDetail = closestSizeDetail.replace('Closest Size Ordered', 'Closest Size to Order');
    }

    formattedLines = [
        windowHeader,
        customSizeDetail,
        customSizeInCm,
        updatedClosestSizeDetail, // Use the updated line
        colorDetail,
        'CLICK HERE: To Order *Closest Size* on Amazon:',
        linkDetail
    ];
            } else if (lines.some(line => line.includes('Exact Match Found'))) {
                const sizeDetail = lines.find(line => line.startsWith('- Size:') || line.startsWith('- Size To Order'));
                const colorDetail = lines.find(line => line.startsWith('- Color'));
                const linkDetail = lines.find(line => line.startsWith('- Link'));
                const originalUnitNote = lines.find(line => line.includes('(Original:')); // Find the original unit note

                formattedLines = [
                    windowHeader,
                    originalUnitNote, // Include the original unit note, if available
                    sizeDetail,
                    colorDetail,
                    'CLICK HERE: To Order *Exact Size* on Amazon:',
                    linkDetail
                ];
            }

            return formattedLines.filter(Boolean).join('\n'); // Remove undefined or null values
        }).join('\n\n');

        // Display the formatted message in the admin area
        adminMessageArea.innerText = formattedMessage;
    }
}

// Share Functionality
document.getElementById('shareButton').addEventListener('click', function () {
    const shareData = {
        title: 'ArmorX Magnetic Mosquito Door Net Calculator',
        text: "Hey look what I found! Try out this amazing ArmorX calculator to get a perfect fit magnetic Mosquito Door Net protection for your home. It's super easy to use! Check it out yourself.",
        url: 'https://armorx-net.github.io/ArmorX-Magnetic-Mosquito-DoorNets/'
    };

    // Check if Web Share API is supported
    if (navigator.share) {
        navigator
            .share(shareData)
            .then(() => console.log('Shared successfully'))
            .catch((err) => console.error('Error sharing:', err));
    } else {
        // Fallback: Copy to clipboard for unsupported browsers
        navigator.clipboard
            .writeText(`${shareData.text} ${shareData.url}`)
            .then(() => alert('Link copied to clipboard! Share it manually.'))
            .catch((err) => console.error('Error copying link:', err));
    }
});
