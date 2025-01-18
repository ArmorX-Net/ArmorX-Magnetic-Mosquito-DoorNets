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

// Helper: Normalize sizes based on input unit
function normalizeSizes(height, width, unit) {
    if (unit === 'Inch') return [height * 2.54, width * 2.54]; // Convert inches to cm
    if (unit === 'Feet') return [height * 30.48, width * 30.48]; // Convert feet to cm
    return [height, width]; // Already in cm
}

// Helper: Find closest match in cm
function findClosestMatch(height, width, color, unit) {
    const [heightCm, widthCm] = normalizeSizes(height, width, unit);
    let closestMatch = null;
    let smallestDifference = Infinity;

    // Filter data by color and unit
    const filteredData = sizeData.filter(size => size['Unit'] === 'cm' && size['Color'].toUpperCase() === color);

    // Find the closest size
    filteredData.forEach(size => {
        const diff1 = Math.abs(size['Height(H)'] - heightCm) + Math.abs(size['Width(W)'] - widthCm);
        const diff2 = Math.abs(size['Height(H)'] - widthCm) + Math.abs(size['Width(W)'] - heightCm);

        const difference = Math.min(diff1, diff2);
        if (difference < smallestDifference) {
            smallestDifference = difference;
            closestMatch = size;
        }
    });

    return closestMatch
        ? {
              match: closestMatch,
              convertedSize: `${roundToNearestHalf(heightCm)} x ${roundToNearestHalf(widthCm)} cm`,
          }
        : null;
}

// Helper: Round to the nearest 0.5
function roundToNearestHalf(value) {
    return Math.round(value * 2) / 2;
}

// Helper: Format results for closest match
function formatClosestMatch(i, closestMatch, originalHeight, originalWidth, convertedSize, unit, color) {
    return `
        <div class="message info">
            <h3>Door ${i}</h3>
            <h4>CLOSEST MATCH FOUND</h4>
            <p>Original Size: ${originalHeight} x ${originalWidth} ${unit}</p>
            <p>Converted Size: ${convertedSize}</p>
            <p>Closest Size To Order: ${closestMatch['Height(H)']} x ${closestMatch['Width(W)']} cm</p>
            <p>Color: ${color}</p>
            <p><a href="${closestMatch['Amazon Link']}" target="_blank">Order on Amazon</a></p>
        </div>
    `;
}

// Main calculation logic
function calculateSizes() {
    const unit = document.getElementById('unit').value;
    const numDoors = parseInt(document.getElementById('numDoors').value);
    const messageArea = document.getElementById('messageArea');
    let orderDetails = [];

    messageArea.innerHTML = ''; // Clear previous messages

    for (let i = 1; i <= numDoors; i++) {
        const height = parseFloat(document.getElementById(`height${i}`).value);
        const width = parseFloat(document.getElementById(`width${i}`).value);
        const color = document.getElementById(`color${i}`).value.toUpperCase();

        if (!height || !width || height <= 0 || width <= 0) {
            messageArea.innerHTML += `<p class="error">Invalid dimensions for Door ${i}. Please enter valid values.</p>`;
            continue;
        }

        // Find the closest match
        const closestMatch = findClosestMatch(height, width, color, unit);
        if (closestMatch) {
            const match = closestMatch.match;
            const convertedSize = closestMatch.convertedSize;
            orderDetails.push(`Door ${i}: Closest Match Found: ${convertedSize} | Order: ${match['Height(H)']} x ${match['Width(W)']} cm | Color: ${color}`);
            messageArea.innerHTML += formatClosestMatch(i, match, height, width, convertedSize, unit, color);
        } else {
            messageArea.innerHTML += `<p class="error">No suitable match found for Door ${i}.</p>`;
        }
    }
}

// Dynamic input field generation for doors
document.getElementById('numDoors').addEventListener('input', function () {
    const numDoors = parseInt(this.value);
    const doorInputsDiv = document.getElementById('doorInputs');
    const selectedUnit = document.getElementById('unit').value;

    doorInputsDiv.innerHTML = ''; // Clear existing inputs
    if (!isNaN(numDoors) && numDoors > 0) {
        for (let i = 1; i <= numDoors; i++) {
            doorInputsDiv.innerHTML += `
                <div class="door-input">
                    <h3>Door ${i}</h3>
                    <label for="height${i}">Enter Height:</label>
                    <input type="number" id="height${i}" placeholder="Enter Height in ${selectedUnit}">
                    <label for="width${i}">Enter Width:</label>
                    <input type="number" id="width${i}" placeholder="Enter Width in ${selectedUnit}">
                    <label for="color${i}">Select Color:</label>
                    <select id="color${i}">
                        <option value="BK">Black</option>
                        <option value="GR">Grey</option>
                        <option value="CR">Cream</option>
                        <option value="WH">White</option>
                    </select>
                </div>
            `;
        }
        doorInputsDiv.style.display = 'block';
    } else {
        doorInputsDiv.style.display = 'none';
    }
});

// Update placeholders dynamically when unit changes
document.getElementById('unit').addEventListener('change', function () {
    const selectedUnit = this.value;
    const numDoors = parseInt(document.getElementById('numDoors').value);
    for (let i = 1; i <= numDoors; i++) {
        const heightInput = document.getElementById(`height${i}`);
        const widthInput = document.getElementById(`width${i}`);
        if (heightInput) heightInput.placeholder = `Enter Height in ${selectedUnit}`;
        if (widthInput) widthInput.placeholder = `Enter Width in ${selectedUnit}`;
    }
});
