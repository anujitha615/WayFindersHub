// ---------- Config ----------
const API_BASE_URL = '/api'; // Use relative if Flask hosts everything

// --- GLOBAL TRIP VARIABLES ---
let map, routeControl;
let currentPositionMarker;
let watchId = null;
let currentRoute = null;
let activeTripId = null;
let autocompleteTimeout;


// --- AUTH UTILITIES (Local Storage Implementation) ---

function getUserData() {
    return JSON.parse(localStorage.getItem('currentUser') || '{}');
}

function checkAuth() {
    // For pages that require authentication (Called on DOMContentLoaded)
    if (!localStorage.getItem('isLoggedIn') && (
            window.location.pathname.includes('services.html')
         || window.location.pathname.includes('saved.html'))) {
        alert('Please login to access this page');
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

// Function called by feature cards to navigate while checking auth
function navigateToServicePage(page) {
    if (localStorage.getItem('isLoggedIn')) {
        window.location.href = page;
    } else {
        alert('Please login to access this feature');
        window.location.href = 'login.html';
    }
}

// Dummy stubs for backward compatibility
async function registerUser(email, password, fullName) {
    return { error: 'Registration handled client-side via login.html script.' };
}

async function loginUser(email, password) {
    return { error: 'Login handled client-side via login.html script.' };
}

// ---------- Navigation Handling ----------
function setActiveNavLink() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('nav a').forEach(link => {
        let href = link.getAttribute('href').split('/').pop() || 'index.html';
        const servicePages = ['restaurant.html', 'hotel.html', 'petrol.html', 'attractions.html', 'vehicle.html', 'emergency.html'];
        
        const isCurrentServiceSubPage = servicePages.includes(currentPage);
        
        if (isCurrentServiceSubPage && href.includes('services.html')) {
             link.classList.add('active');
        } else if (isCurrentServiceSubPage && href.includes(currentPage)) {
             link.classList.add('active'); 
        } else {
             link.classList.toggle('active', href.includes(currentPage));
        }
    });
}

function setupMobileNavigation() {
    // Mobile navigation setup logic
}

// ---------- Notifications / Toast (Extracted from trip.html) ----------

// Show toast notification
function showToast(message, type = "info") {
    const toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
        return; 
    }
    
    const toastEl = document.createElement('div');
    toastEl.className = `toast custom-toast toast-${type}`;
    toastEl.setAttribute('role', 'alert');
    toastEl.setAttribute('aria-live', 'assertive');
    toastEl.setAttribute('aria-atomic', 'true');
    
    let icon = 'info-circle';
    if (type === 'success') icon = 'check-circle';
    if (type === 'warning') icon = 'exclamation-triangle';
    if (type === 'error') icon = 'exclamation-circle';
    
    toastEl.innerHTML = `
        <div class="toast-header">
            <i class="fas fa-${icon} text-${type} me-2"></i>
            <strong class="me-auto">WayFindersHub</strong>
            <button type="button" class="btn-close" data-bs-dismiss="toast"></button>
        </div>
        <div class="toast-body">
            ${message}
        </div>
    `;
    
    toastContainer.appendChild(toastEl);
    
    // Check for Bootstrap utility functions availability before calling
    if (typeof bootstrap !== 'undefined' && bootstrap.Toast) {
        const toast = new bootstrap.Toast(toastEl, {
            autohide: true,
            delay: 3000
        });
        
        toast.show();
        
        // Remove the toast from DOM after it's hidden
        toastEl.addEventListener('hidden.bs.toast', function() {
            if (toastContainer.contains(toastEl)) {
                toastContainer.removeChild(toastEl);
            }
        });
    }
}

// Keeping older showNotification for compatibility
function showNotification(message, type = 'info') {
    if (document.querySelector('.toast-container')) {
        showToast(message, type);
        return;
    }

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => { notification.remove(); }, 5000);
}


// ---------- SAVED TRIPS (Local Storage Implementation) ----------

function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    let result = '';
    if (hours > 0) result += `${hours} hr `;
    result += `${minutes} min`;
    return result;
}

async function saveTrip() {
    const tripName = document.getElementById('tripName').value.trim();
    const isFavorite = document.getElementById('favoriteTrip').checked;
    
    if (!currentRoute) {
        showToast("No active trip to save. Please plan a trip first.", "error");
        return;
    }

    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    if (!currentUser.id) {
        showToast("Please login to save trips", "warning");
        return;
    }
    
    if (!tripName) {
        showToast("Please enter a name for your trip", "warning");
        return;
    }
    
    const savedTrips = JSON.parse(localStorage.getItem('savedTrips') || '[]');
    
    const tripExists = savedTrips.some(trip => 
        trip.userId === currentUser.id && 
        trip.name === tripName
    );
    
    if (tripExists) {
        showToast("You already have a saved trip with this name. Please choose a different name.", "warning");
        return;
    }
    
    currentRoute.userId = currentUser.id;
    currentRoute.id = Date.now();
    currentRoute.name = tripName;
    currentRoute.isFavorite = isFavorite;
    currentRoute.savedAt = new Date().toISOString();
    
    savedTrips.push(currentRoute);
    localStorage.setItem('savedTrips', JSON.stringify(savedTrips));
    
    const modal = bootstrap.Modal.getInstance(document.getElementById('saveTripModal'));
    modal.hide();
    
    showToast("Trip saved successfully!", "success");
    
    document.getElementById('tripName').value = "";
    document.getElementById('favoriteTrip').checked = false;
}

function loadSavedTrips() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const allTrips = JSON.parse(localStorage.getItem('savedTrips') || '[]');
    
    const userTrips = allTrips.filter(trip => trip.userId === currentUser.id);
    const container = document.getElementById('savedTripsList');
    
    if (!container) return; 
    
    if (userTrips.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-bookmark"></i>
                <h4>No saved trips yet</h4>
                <p>Start planning your first trip and save it for later!</p>
                <a href="trip.html" class="btn btn-primary mt-3">
                    <i class="fas fa-route me-2"></i>Plan a Trip
                </a>
            </div>
        `;
        return;
    }
    
    let html = '';
    userTrips.forEach((trip, index) => {
        html += `
            <div class="trip-card">
                <div class="d-flex justify-content-between align-items-start">
                    <div>
                        <div class="trip-route">
                            <i class="fas fa-route me-2"></i>${trip.startName || 'Starting point'} to ${trip.endName || 'Destination'}
                        </div>
                        <div class="trip-date">
                            <i class="far fa-clock me-1"></i>${new Date(trip.timestamp).toLocaleString()}
                        </div>
                        ${trip.distance ? `<div class="trip-distance mt-1">
                            <i class="fas fa-road me-1"></i>${(trip.distance / 1000).toFixed(1)} km
                        </div>` : ''}
                        ${trip.duration ? `<div class="trip-duration mt-1">
                            <i class="fas fa-clock me-1"></i>${formatDuration(trip.duration)}
                        </div>` : ''}
                    </div>
                    <div class="trip-actions">
                        <button class="btn btn-sm btn-view" onclick="viewTrip(${trip.id})">
                            <i class="fas fa-eye me-1"></i>View
                        </button>
                        <button class="btn btn-sm btn-delete" onclick="deleteTripById(${trip.id})">
                            <i class="fas fa-trash-alt me-1"></i>Delete
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function deleteTripById(tripId) {
    if (confirm('Are you sure you want to delete this trip?')) {
        const allTrips = JSON.parse(localStorage.getItem('savedTrips') || '[]');
        const updatedTrips = allTrips.filter(trip => trip.id !== tripId); 
        localStorage.setItem('savedTrips', JSON.stringify(updatedTrips));
        loadSavedTrips();
    }
}

function viewTrip(tripId) {
    window.location.href = `trip.html?load=${tripId}`;
}


// ---------- PASSWORD TOGGLE (For login.html) ----------
function togglePassword(id) {
    const input = document.getElementById(id);
    const icon = input.nextElementSibling.querySelector('i');

    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

// ---------- WEATHER UTILITIES (For index.html) ----------
function getWeather(lat, lon) {
    fetch(`https://wttr.in/?format=j1`)
        .then(response => response.json())
        .then(data => {
            updateWeatherUI(data);
        })
        .catch(error => {
            console.error("Error fetching weather:", error);
            getWeatherByCity('Kochi');
        });
}

function getWeatherByCity(city) {
    fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`)
        .then(response => response.json())
        .then(data => {
            updateWeatherUI(data);
        })
        .catch(error => {
            console.error("Error fetching weather:", error);
            document.getElementById('weatherLocation').textContent = 'Weather data unavailable';
        });
}

function updateWeatherUI(data) {
    const current = data.current_condition[0];
    
    document.getElementById('weatherTemp').textContent = `${current.temp_C}°C`;
    document.getElementById('weatherDescription').textContent = current.weatherDesc[0].value;
    document.getElementById('feelsLike').textContent = `${current.FeelsLikeC}°C`;
    document.getElementById('humidity').textContent = `${current.humidity}%`;
    document.getElementById('windSpeed').textContent = `${current.windspeedKmph} km/h`;
    
    const location = data.nearest_area[0].areaName[0].value;
    const region = data.nearest_area[0].region[0].value;
    document.getElementById('weatherLocation').textContent = `${location}, ${region}`;
}


// ---------- VEHICLE RENTAL DATA & LOGIC (From vehicle.html) ----------

const vehicleData = [
  {Vehicle_Name: "Toyota Innova Crysta", Vehicle_Type: "suv", City: "kochi", Daily_Price: 2500, Passenger_Capacity: 7, Features: ["Automatic Transmission", "Air Conditioning", "GPS Navigation", "Bluetooth", "Fuel Efficient"]},
  {Vehicle_Name: "Maruti Suzuki Swift", Vehicle_Type: "economy", City: "kochi", Daily_Price: 1200, Passenger_Capacity: 5, Features: ["Manual Transmission", "Air Conditioning", "Fuel Efficient", "Compact Size"]},
  {Vehicle_Name: "Mercedes-Benz E-Class", Vehicle_Type: "luxury", City: "kochi", Daily_Price: 8000, Passenger_Capacity: 5, Features: ["Automatic Transmission", "Premium Sound System", "Leather Seats", "Sunroof", "Advanced Safety Features"]},
  {Vehicle_Name: "Honda City", Vehicle_Type: "economy", City: "kochi", Daily_Price: 1500, Passenger_Capacity: 5, Features: ["Automatic Transmission", "Air Conditioning", "Spacious Interior", "Fuel Efficient"]},
  {Vehicle_Name: "Toyota Fortuner", Vehicle_Type: "suv", City: "kochi", Daily_Price: 4000, Passenger_Capacity: 7, Features: ["4WD Capability", "Automatic Transmission", "Air Conditioning", "Roof Rack", "All-Terrain Tires"]},
  {Vehicle_Name: "Mahindra XUV500", Vehicle_Type: "suv", City: "kochi", Daily_Price: 3000, Passenger_Capacity: 7, Features: ["Automatic Transmission", "Air Conditioning", "Touchscreen Infotainment", "Spacious Interior"]},
  {Vehicle_Name: "Hyundai Creta", Vehicle_Type: "suv", City: "kochi", Daily_Price: 2800, Passenger_Capacity: 5, Features: ["Automatic Transmission", "Air Conditioning", "Sunroof", "Rear Camera"]},
  {Vehicle_Name: "Maruti Suzuki Ertiga", Vehicle_Type: "van", City: "kochi", Daily_Price: 2000, Passenger_Capacity: 7, Features: ["Manual Transmission", "Air Conditioning", "Spacious Interior", "Fuel Efficient"]},
  {Vehicle_Name: "BMW 5 Series", Vehicle_Type: "luxury", City: "kochi", Daily_Price: 9000, Passenger_Capacity: 5, Features: ["Automatic Transmission", "Premium Sound System", "Leather Seats", "Heated Seats", "Advanced Safety Features"]},
  {Vehicle_Name: "Ford EcoSport", Vehicle_Type: "suv", City: "kochi", Daily_Price: 2200, Passenger_Capacity: 5, Features: ["Automatic Transmission", "Air Conditioning", "Compact SUV", "Good Mileage"]}
];

function getVehicleTypeIcon(type) {
    const icons = {
        economy: "fas fa-car",
        suv: "fas fa-shuttle-van",
        luxury: "fas fa-gem",
        van: "fas fa-van-shuttle",
        convertible: "fas fa-car-convertible"
    };
    return icons[type] || "fas fa-car";
}

function getVehicleImage(vehicle) {
    const imageCategories = {
        economy: [
            'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
            'https://images.pexels.com/photos/112460/pexels-photo-112460.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1'
        ],
        suv: [
            'https://images.unsplash.com/photo-1503376780353-7e6692767b70?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
            'https://images.pexels.com/photos/116675/pexels-photo-116675.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1'
        ],
        luxury: [
            'https://images.unsplash.com/photo-1542362567-b07e54358753?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
            'https://images.pexels.com/photos/120049/pexels-photo-120049.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1'
        ],
        van: [
            'https://images.unsplash.com/photo-1563720223880-4d93eef1f1c2?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
            'https://images.pexels.com/photos/2394/light-vehicle-car-van.jpg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1'
        ],
        convertible: [
            'https://images.unsplash.com/photo-1601268859287-9cec8a74e9f8?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
            'https://images.pexels.com/photos/909907/pexels-photo-909907.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1'
        ]
    };
    
    const categoryImages = imageCategories[vehicle.Vehicle_Type] || imageCategories.economy;
    return categoryImages[Math.floor(Math.random() * categoryImages.length)];
}

function displayVehicles(vehicles) {
    const resultsContainer = document.getElementById('vehicleResults');
    if (!resultsContainer) return;
    resultsContainer.innerHTML = '';
    
    if (vehicles.length === 0) {
        document.getElementById('noResults').style.display = 'block';
        return;
    }
    
    document.getElementById('noResults').style.display = 'none';
    
    vehicles.forEach(vehicle => {
        const vehicleCard = document.createElement('div');
        vehicleCard.className = 'col';
        const vehicleImage = getVehicleImage(vehicle);
        const vehicleIcon = getVehicleTypeIcon(vehicle.Vehicle_Type);
        
        vehicleCard.innerHTML = `
          <div class="vehicle-card">
            <div class="vehicle-image" style="background-image: url('${vehicleImage}')">
              <i class="fas fa-car placeholder-icon" style="display: none;"></i>
            </div>
            <div class="vehicle-details">
              <h3><i class="${vehicleIcon} vehicle-type-icon"></i> ${vehicle.Vehicle_Name}</h3>
              <p><i class="fas fa-map-marker-alt"></i> ${vehicle.City.charAt(0).toUpperCase() + vehicle.City.slice(1)}</p>
              <p><i class="fas fa-users"></i> ${vehicle.Passenger_Capacity} Passengers</p>
              
              <div class="mb-2">
                ${vehicle.Features.map(feature => `<span class="feature-badge">${feature}</span>`).join('')}
              </div>
              
              <p class="vehicle-price">₹${vehicle.Daily_Price}/day</p>
              <button class="service-btn w-100" onclick="alert('Rental functionality would be implemented here for ${vehicle.Vehicle_Name}')">Rent Now</button>
            </div>
          </div>
        `;
        
        resultsContainer.appendChild(vehicleCard);
    });
}

function filterVehicles() {
    const pickupLocation = document.getElementById('pickupLocation').value.toLowerCase();
    const vehicleType = document.getElementById('vehicleType').value;
    const priceRange = document.getElementById('priceRange').value;
    const passengerCapacity = parseInt(document.getElementById('passengerCapacity').value);
    const sortBy = document.getElementById('sortBy').value;
    
    const loadingSpinner = document.getElementById('loadingSpinner');
    if (loadingSpinner) loadingSpinner.style.display = 'block';
    
    setTimeout(() => {
        let filteredVehicles = vehicleData;
        
        if (pickupLocation) {
          filteredVehicles = filteredVehicles.filter(vehicle => 
            vehicle.City.toLowerCase().includes(pickupLocation)
          );
        }
        
        if (vehicleType !== 'all') {
          filteredVehicles = filteredVehicles.filter(vehicle => 
            vehicle.Vehicle_Type === vehicleType
          );
        }
        
        if (priceRange !== 'all') {
          if (priceRange === '10000+') {
            filteredVehicles = filteredVehicles.filter(vehicle => vehicle.Daily_Price >= 10000);
          } else {
            const [min, max] = priceRange.split('-').map(Number);
            filteredVehicles = filteredVehicles.filter(vehicle => 
              vehicle.Daily_Price >= min && vehicle.Daily_Price <= max
            );
          }
        }
        
        if (passengerCapacity > 0) {
          filteredVehicles = filteredVehicles.filter(vehicle => 
            vehicle.Passenger_Capacity >= passengerCapacity
          );
        }
        
        switch(sortBy) {
          case 'price-asc':
            filteredVehicles.sort((a, b) => a.Daily_Price - b.Daily_Price);
            break;
          case 'price-desc':
            filteredVehicles.sort((a, b) => b.Daily_Price - a.Daily_Price);
            break;
          case 'capacity-desc':
            filteredVehicles.sort((a, b) => b.Passenger_Capacity - a.Passenger_Capacity);
            break;
          case 'name-asc':
            filteredVehicles.sort((a, b) => a.Vehicle_Name.localeCompare(b.Vehicle_Name));
            break;
        }
        
        displayVehicles(filteredVehicles);
        
        if (loadingSpinner) loadingSpinner.style.display = 'none';
    }, 800);
}


// ---------- HOTEL DATA & LOGIC (From hotel.html) ----------

const hotelData = [
  {Hotel_Name: "Crowne Plaza Kochi", Hotel_Rating: 4.6, City: "kochi", Hotel_Price: 8854, Features: ["5-star hotel", "Free breakfast", "Free Wi-Fi", "Free parking", "Pool", "Hot tub", "Air conditioning", "Fitness center", "Spa"]},
  {Hotel_Name: "Trident Hotel Cochin", Hotel_Rating: 4.5, City: "kochi", Hotel_Price: 6441, Features: ["5-star hotel", "Free breakfast", "Wi-Fi", "Free parking", "Pool", "Air conditioning", "Fitness center", "Spa", "Restaurant"]},
  {Hotel_Name: "The Galaxy Suites", Hotel_Rating: 3.8, City: "kochi", Hotel_Price: 831, Features: ["Apartment", "Sleeps 10", "Free parking", "Free Wi-Fi", "No air conditioning", "No airport shuttle", "No beach access", "No elevator", "No fireplace"]},
  {Hotel_Name: "The Renai cochin", Hotel_Rating: 4.2, City: "kochi", Hotel_Price: 2768, Features: ["4-star hotel", "Free breakfast", "Free Wi-Fi", "Free parking", "Pool", "Air conditioning", "Fitness center", "Spa", "Bar"]},
  {Hotel_Name: "Ramada by Wyndham Kochi", Hotel_Rating: 4.5, City: "kochi", Hotel_Price: 8938, Features: ["5-star hotel", "Breakfast", "Free Wi-Fi", "Free parking", "Pool", "Air conditioning", "Fitness center", "Spa", "Bar"]},
  {Hotel_Name: "Radisson Blu Hotel, Kochi", Hotel_Rating: 4.3, City: "kochi", Hotel_Price: 6061, Features: ["5-star hotel", "Breakfast", "Free Wi-Fi", "Free parking", "Pool", "Hot tub", "Air conditioning", "Fitness center", "Spa"]},
  {Hotel_Name: "Holiday Inn Cochin, an IHG Hotel", Hotel_Rating: 4.4, City: "kochi", Hotel_Price: 5689, Features: ["5-star hotel", "Breakfast", "Free Wi-Fi", "Free parking", "Pool", "Air conditioning", "Fitness center", "Bar", "Restaurant"]},
  {Hotel_Name: "OAK FIELD INN", Hotel_Rating: 3.8, City: "kochi", Hotel_Price: 819, Features: ["Free breakfast", "Wi-Fi", "Free parking", "Air conditioning", "Restaurant", "Kitchen", "Full-service laundry", "Kid-friendly"]},
  {Hotel_Name: "Grand Hyatt Kochi Bolgatty", Hotel_Rating: 4.7, City: "kochi", Hotel_Price: 14282, Features: ["5-star hotel", "Breakfast", "Free Wi-Fi", "Free parking", "Pool", "Hot tub", "Air conditioning", "Fitness center", "Spa"]},
  {Hotel_Name: "Hotel South Gate Residency", Hotel_Rating: 3.9, City: "kochi", Hotel_Price: 1051, Features: ["3-star hotel", "Breakfast", "Free Wi-Fi", "Free parking", "Air conditioning", "Restaurant", "Airport shuttle", "Full-service laundry", "Kid-friendly"]}
];

function generateStarRating(rating) {
  let starsHtml = '';
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;
  
  for (let i = 0; i < fullStars; i++) {
    starsHtml += '<i class="fas fa-star text-warning"></i>';
  }
  
  if (hasHalfStar) {
    starsHtml += '<i class="fas fa-star-half-alt text-warning"></i>';
  }
  
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
  for (let i = 0; i < emptyStars; i++) {
    starsHtml += '<i class="far fa-star text-warning"></i>';
  }
  
  return starsHtml;
}

function getHotelImage(hotel) {
  const imageCategories = [];
  
  if (hotel.Features.some(f => f.includes('5-star') || f.includes('4-star'))) {
    imageCategories.push('luxury');
  }
  if (hotel.Features.some(f => f.includes('Pool'))) {
    imageCategories.push('pool');
  }
  if (hotel.Features.some(f => f.includes('Spa'))) {
    imageCategories.push('spa');
  }
  
  if (imageCategories.length === 0) {
    imageCategories.push('hotel');
  }
  
  const category = imageCategories[Math.floor(Math.random() * imageCategories.length)];
  
  const images = {
    luxury: [
      'https://images.unsplash.com/photo-1566073771259-6a8506099945?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
      'https://images.pexels.com/photos/258154/pexels-photo-258154.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
      'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
    ],
    pool: [
      'https://images.unsplash.com/photo-1551516594-56cb78394645?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1566073771259-6a8506099945?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
    ],
    spa: [
      'https://images.unsplash.com/photo-1540497077202-7c8a3999166f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1599458254073-8b90ed6f7bb0?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
    ],
    hotel: [
      'https://images.pexels.com/photos/271624/pexels-photo-271624.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
      'https://images.unsplash.com/photo-1618773928121-c32242e63f39?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
      'https://images.pexels.com/photos/237371/pexels-photo-237371.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1'
    ]
  };
  
  const categoryImages = images[category];
  return categoryImages[Math.floor(Math.random() * categoryImages.length)];
}

function displayHotels(hotels) {
  const resultsContainer = document.getElementById('hotelResults');
  if (!resultsContainer) return;
  resultsContainer.innerHTML = '';
  
  if (hotels.length === 0) {
    document.getElementById('noResults').style.display = 'block';
    return;
  }
  
  document.getElementById('noResults').style.display = 'none';
  
  hotels.forEach(hotel => {
    const hotelCard = document.createElement('div');
    hotelCard.className = 'col';
    
    const hotelImage = getHotelImage(hotel);
    const starRating = generateStarRating(hotel.Hotel_Rating);
    const topFeatures = hotel.Features.slice(0, 3);
    
    hotelCard.innerHTML = `
      <div class="hotel-card">
        <div class="hotel-image" style="background-image: url('${hotelImage}')">
          <i class="fas fa-hotel placeholder-icon" style="display: none;"></i>
        </div>
        <div class="hotel-details">
          <h3>${hotel.Hotel_Name}</h3>
          <p><i class="fas fa-map-marker-alt"></i> ${hotel.City.charAt(0).toUpperCase() + hotel.City.slice(1)}</p>
          <p>${starRating} ${hotel.Hotel_Rating} (${Math.floor(Math.random() * 100) + 50} reviews)</p>
          
          <div class="mb-2">
            ${topFeatures.map(feature => `<span class="feature-badge">${feature}</span>`).join('')}
          </div>
          
          <p class="hotel-price">₹${hotel.Hotel_Price}/night</p>
          <button class="service-btn w-100" onclick="alert('Booking functionality would be implemented here for ${hotel.Hotel_Name}')">View Details</button>
        </div>
      </div>
    `;
    
    resultsContainer.appendChild(hotelCard);
  });
}

function filterHotels() {
  const destination = document.getElementById('destination').value.toLowerCase();
  const priceRange = document.getElementById('priceRange').value;
  const minRating = parseFloat(document.getElementById('hotelRating').value);
  const sortBy = document.getElementById('sortBy').value;
  
  const loadingSpinner = document.getElementById('loadingSpinner');
  if (loadingSpinner) loadingSpinner.style.display = 'block';
  
  setTimeout(() => {
    let filteredHotels = hotelData;
    
    if (destination) {
      filteredHotels = filteredHotels.filter(hotel => 
        hotel.City.toLowerCase().includes(destination) || 
        hotel.Hotel_Name.toLowerCase().includes(destination)
      );
    }
    
    if (priceRange !== 'all') {
      if (priceRange === '20000+') {
        filteredHotels = filteredHotels.filter(hotel => hotel.Hotel_Price >= 20000);
      } else {
        const [min, max] = priceRange.split('-').map(Number);
        filteredHotels = filteredHotels.filter(hotel => 
          hotel.Hotel_Price >= min && hotel.Hotel_Price <= max
        );
      }
    }
    
    if (minRating > 0) {
      filteredHotels = filteredHotels.filter(hotel => hotel.Hotel_Rating >= minRating);
    }
    
    switch(sortBy) {
      case 'price-asc':
        filteredHotels.sort((a, b) => a.Hotel_Price - b.Hotel_Price);
        break;
      case 'price-desc':
        filteredHotels.sort((a, b) => b.Hotel_Price - a.Hotel_Price);
        break;
      case 'rating-desc':
        filteredHotels.sort((a, b) => b.Hotel_Rating - a.Hotel_Rating);
        break;
      case 'name-asc':
        filteredHotels.sort((a, b) => a.Hotel_Name.localeCompare(b.Hotel_Name));
        break;
    }
    
    displayHotels(filteredHotels);
    
    if (loadingSpinner) loadingSpinner.style.display = 'none';
  }, 800); 
}


// ---------- ATTRACTION DATA & LOGIC (From attractions.html) ----------

const attractionData = [
  {Attraction_Name: "Fort Kochi", Attraction_Type: "historical", City: "kochi", Distance: 2.5, Rating: 4.7, Features: ["Portuguese Architecture", "Historical Walk", "Photo Opportunities", "Cultural Hub"], Description: "A charming historical area with colonial architecture and a rich cultural heritage."},
  {Attraction_Name: "Mattancherry Palace", Attraction_Type: "historical", City: "kochi", Distance: 3.1, Rating: 4.3, Features: ["Dutch Palace", "Mural Paintings", "Royal Exhibits", "Historical Artifacts"], Description: "Also known as the Dutch Palace, features Kerala murals depicting Hindu temple art."},
  {Attraction_Name: "Chinese Fishing Nets", Attraction_Type: "cultural", City: "kochi", Distance: 2.8, Rating: 4.5, Features: ["Iconic Landmark", "Photo Opportunities", "Sunset Views", "Local Culture"], Description: "Iconic fishing nets that are a hallmark of Kochi's coastline and cultural heritage."},
  {Attraction_Name: "Jewish Synagogue", Attraction_Type: "religious", City: "kochi", Distance: 3.2, Rating: 4.4, Features: ["Historical Site", "Religious Significance", "Ancient Architecture", "Cultural Heritage"], Description: "The oldest active synagogue in the Commonwealth of Nations, built in 1568."},
  {Attraction_Name: "Marine Drive", Attraction_Type: "natural", City: "kochi", Distance: 1.5, Rating: 4.6, Features: ["Waterfront Promenade", "Sunset Views", "Boating", "Shopping"], Description: "A picturesque promenade along the backwaters offering beautiful views and recreational activities."},
  {Attraction_Name: "Hill Palace Museum", Attraction_Type: "museum", City: "kochi", Distance: 12.3, Rating: 4.2, Features: ["Archaeological Museum", "Royal Collections", "Heritage Building", "Gardens"], Description: "Largest archaeological museum in Kerala, former administrative office of Kochi Rajas."},
  {Attraction_Name: "Bolghatty Palace", Attraction_Type: "historical", City: "kochi", Distance: 4.5, Rating: 4.1, Features: ["Dutch Palace", "Island Location", "Luxury Hotel", "Golf Course"], Description: "A historic palace on Bolghatty Island, now operated as a heritage hotel."},
  {Attraction_Name: "Kerala Folklore Museum", Attraction_Type: "museum", City: "kochi", Distance: 5.7, Rating: 4.8, Features: ["Cultural Artifacts", "Traditional Architecture", "Art Collections", "Performance Space"], Description: "Showcases Kerala's cultural heritage through artifacts, architecture, and performances."},
  {Attraction_Name: "Cherai Beach", Attraction_Type: "natural", City: "kochi", Distance: 25.8, Rating: 4.5, Features: ["Sandy Beach", "Swimming", "Water Sports", "Relaxation"], Description: "A beautiful beach combining the beauty of the sea and backwaters, ideal for relaxation."},
  {Attraction_Name: "Mangalavanam Bird Sanctuary", Attraction_Type: "natural", City: "kochi", Distance: 1.8, Rating: 4.0, Features: ["Bird Watching", "Nature Walk", "Eco Tourism", "Urban Sanctuary"], Description: "An ecologically sensitive area serving as a natural habitat for many species of birds."},
  {Attraction_Name: "St. Francis Church", Attraction_Type: "religious", City: "kochi", Distance: 2.7, Rating: 4.3, Features: ["Historical Church", "Vasco da Gama Tomb", "Portuguese Architecture", "Religious Significance"], Description: "The oldest European church in India, originally built in 1503."},
  {Attraction_Name: "Vypin Island", Attraction_Type: "natural", City: "kochi", Distance: 8.2, Rating: 4.4, Features: ["Island Experience", "Beaches", "Lighthouse", "Local Culture"], Description: "A long, narrow island with beaches, a lighthouse, and traditional fishing villages."}
];

function getAttractionTypeIcon(type) {
  const icons = {
    historical: "fas fa-landmark",
    natural: "fas fa-mountain",
    cultural: "fas fa-theater-masks",
    religious: "fas fa-place-of-worship",
    museum: "fas fa-university"
  };
  return icons[type] || "fas fa-camera";
}

function getAttractionImage(attraction) {
  const imageCategories = {
    historical: [
      'https://images.unsplash.com/photo-1587334274527-ba54f0b5a357?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
      'https://images.pexels.com/photos/1261731/pexels-photo-1261731.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1'
    ],
    natural: [
      'https://images.unsplash.com/photo-1506744038136-46273834b3fb?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
      'https://images.pexels.com/photos-3225531/pexels-photo-3225531.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1'
    ],
    cultural: [
      'https://images.unsplash.com/photo-1580739824572-f54c2763f64e?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
      'https://images.pexels.com/photos/1279813/pexels-photo-1279813.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1'
    ],
    religious: [
      'https://images.unsplash.com/photo-1580309237429-661ea7cd1d53?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
      'https://images.pexels.com/photos/1573134/pexels-photo-1573134.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1'
    ],
    museum: [
      'https://images.unsplash.com/photo-1578662996442-48f60103fc96?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
      'https://images.pexels.com/photos/236349/pexels-photo-236349.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1'
    ]
  };
  
  const categoryImages = imageCategories[attraction.Attraction_Type] || imageCategories.historical;
  return categoryImages[Math.floor(Math.random() * categoryImages.length)];
}

function handleAttractionAction(attractionName) {
  alert(`Showing details for ${attractionName}...\n\nIn a real application, this would show detailed information about the attraction.`);
}

function displayAttractions(attractions) {
  const resultsContainer = document.getElementById('attractionResults');
  if (!resultsContainer) return;
  resultsContainer.innerHTML = '';
  
  if (attractions.length === 0) {
    document.getElementById('noResults').style.display = 'block';
    return;
  }
  
  document.getElementById('noResults').style.display = 'none';
  
  attractions.forEach(attraction => {
    const attractionCard = document.createElement('div');
    attractionCard.className = 'col';
    
    const attractionImage = getAttractionImage(attraction);
    const starRating = generateStarRating(attraction.Rating);
    
    const attractionTypeMap = {
      historical: "Historical Site",
      natural: "Natural Wonder",
      cultural: "Cultural Experience",
      religious: "Religious Site",
      museum: "Museum & Gallery"
    };
    
    const attractionTypeDisplay = attractionTypeMap[attraction.Attraction_Type] || "Tourist Attraction";
    
    attractionCard.innerHTML = `
      <div class="attraction-card">
        <div class="attraction-image" style="background-image: url('${attractionImage}')">
          <i class="fas fa-camera placeholder-icon" style="display: none;"></i>
        </div>
        <div class="attraction-details">
          <span class="attraction-type">${attractionTypeDisplay}</span>
          <h3>${attraction.Attraction_Name}</h3>
          <p class="mb-2">${attraction.Description}</p>
          <p><i class="fas fa-map-marker-alt"></i> ${attraction.Distance} km away · ${attraction.City.charAt(0).toUpperCase() + attraction.City.slice(1)}</p>
          
          <div class="d-flex justify-content-between align-items-center mb-2">
            <div class="rating-badge">
              <i class="fas fa-star"></i> ${attraction.Rating}
            </div>
            <div>
              ${starRating}
            </div>
          </div>
          
          <div class="mb-3">
            ${attraction.Features.map(feature => `<span class="feature-badge">${feature}</span>`).join('')}
          </div>
          
          <button class="attraction-btn" onclick="handleAttractionAction('${attraction.Attraction_Name}')">
            <i class="fas fa-info-circle"></i> View Details
          </button>
        </div>
      </div>
    `;
    
    resultsContainer.appendChild(attractionCard);
  });
}

function filterAttractions() {
  const attractionSearchForm = document.getElementById('attractionSearchForm');
  if (!attractionSearchForm) return;

  const attractionType = document.getElementById('attractionType').value;
  const radius = parseInt(document.getElementById('radius').value);
  const minRating = parseFloat(document.getElementById('rating').value);
  const sortBy = document.getElementById('sortBy').value;
  
  const loadingSpinner = document.getElementById('loadingSpinner');
  if (loadingSpinner) loadingSpinner.style.display = 'block';
  
  setTimeout(() => {
    let filteredAttractions = attractionData;
    
    if (attractionType !== 'all') {
      filteredAttractions = filteredAttractions.filter(attraction => 
        attraction.Attraction_Type === attractionType
      );
    }
    
    filteredAttractions = filteredAttractions.filter(attraction => 
      attraction.Distance <= radius
    );
    
    if (minRating > 0) {
      filteredAttractions = filteredAttractions.filter(attraction => 
        attraction.Rating >= minRating
      );
    }
    
    switch(sortBy) {
      case 'popularity':
        filteredAttractions.sort((a, b) => b.Rating - a.Rating);
        break;
      case 'distance':
        filteredAttractions.sort((a, b) => a.Distance - b.Distance);
        break;
      case 'rating':
        filteredAttractions.sort((a, b) => b.Rating - a.Rating);
        break;
      case 'name':
        filteredAttractions.sort((a, b) => a.Attraction_Name.localeCompare(b.Attraction_Name));
        break;
    }
    
    displayAttractions(filteredAttractions);
    
    if (loadingSpinner) loadingSpinner.style.display = 'none';
  }, 800);
}


// ---------- TRIP PLANNER LOGIC (From trip.html) ----------

// Initialize the map
function initMap() {
    if (typeof L === 'undefined') {
        console.error("Leaflet library not loaded.");
        return;
    }
    map = L.map('routeMap').setView([10.8505, 76.2711], 8); // Center on Kerala
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);
}

// Setup address autocomplete using Nominatim API
function setupAutocomplete() {
    setupAutocompleteForInput('start', 'startAutocomplete');
    setupAutocompleteForInput('end', 'endAutocomplete');
}

function setupAutocompleteForInput(inputId, resultsId) {
    const input = document.getElementById(inputId);
    const results = document.getElementById(resultsId);
    
    if (!input || !results) return;

    input.addEventListener('input', function() {
        clearTimeout(autocompleteTimeout);
        const query = input.value.trim();
        
        if (query.length < 3) {
            results.innerHTML = '';
            return;
        }
        
        autocompleteTimeout = setTimeout(() => {
            fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5`)
                .then(response => response.json())
                .then(data => {
                    results.innerHTML = '';
                    if (data && data.length > 0) {
                        data.forEach(item => {
                            const div = document.createElement('div');
                            div.innerHTML = item.display_name;
                            div.addEventListener('click', function() {
                                input.value = item.display_name;
                                results.innerHTML = '';
                            });
                            results.appendChild(div);
                        });
                    }
                });
        }, 300);
    });
    
    document.addEventListener('click', function(e) {
        if (e.target !== input) {
            results.innerHTML = '';
        }
    });
}

function performClearRoute() {
    if (routeControl) {
        map.removeControl(routeControl);
        routeControl = null;
    }
    if (currentPositionMarker) {
        map.removeLayer(currentPositionMarker);
        currentPositionMarker = null;
    }
    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
    
    document.getElementById('instructions').innerHTML = '';
    document.getElementById('startTripBtn').disabled = true;
    document.getElementById('tripProgress').style.display = 'none';
    document.getElementById('tripIdContainer').style.display = 'none';
    
    if (document.getElementById('start')) document.getElementById('start').value = '';
    if (document.getElementById('end')) document.getElementById('end').value = '';
    
    map.eachLayer(layer => {
        if (layer instanceof L.Marker) {
             map.removeLayer(layer);
        }
    });
    
    currentRoute = null;
    activeTripId = null;
}

function getCurrentLocation() {
    if (!navigator.geolocation) {
        showToast("Geolocation is not supported by your browser.", "error");
        return;
    }

    const startInput = document.getElementById('start');
    if (!startInput) return;

    startInput.value = "Detecting your location...";
    
    navigator.geolocation.getCurrentPosition(
        function(position) {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            
            fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
                .then(response => response.json())
                .then(data => {
                    if (data && data.display_name) {
                        startInput.value = data.display_name;
                        
                        if (routeControl) {
                            const endAddress = document.getElementById('end').value;
                            if (endAddress) {
                                planTrip();
                            }
                        }
                    } else {
                        startInput.value = `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;
                    }
                })
                .catch(error => {
                    startInput.value = `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;
                });
        },
        function(error) {
            startInput.value = "";
            showToast("Error getting your location: " + error.message, "error");
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

function planTrip() {
    const startAddress = document.getElementById('start').value;
    const endAddress = document.getElementById('end').value;
    
    const instructionsDiv = document.getElementById('instructions');
    if (instructionsDiv) instructionsDiv.innerHTML = '<div class="text-center py-3"><i class="fas fa-spinner fa-spin me-2"></i> Calculating route...</div>';
    
    document.getElementById('tripProgress').style.display = 'none';
    document.getElementById('startTripBtn').disabled = true;
    
    Promise.all([
        geocodeAddress(startAddress),
        geocodeAddress(endAddress)
    ]).then(coordinates => {
        const startCoords = coordinates[0];
        const endCoords = coordinates[1];
        
        if (!startCoords || !endCoords) {
            throw new Error("Could not find one or both locations");
        }
        
        if (routeControl) {
            map.removeControl(routeControl);
            routeControl = null;
        }
        if (currentPositionMarker) {
             map.removeLayer(currentPositionMarker);
        }
        map.eachLayer(layer => {
            if (layer instanceof L.Marker) {
                 map.removeLayer(layer);
            }
        });
        
        L.marker([startCoords.lat, startCoords.lng], {
            icon: L.icon({
                iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
                iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34]
            })
        }).addTo(map).bindPopup("<b>Start Point</b><br>" + startCoords.displayName);
        
        L.marker([endCoords.lat, endCoords.lng], {
            icon: L.icon({
                iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
                iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34]
            })
        }).addTo(map).bindPopup("<b>Destination</b><br>" + endCoords.displayName);
        
        routeControl = L.Routing.control({
            waypoints: [
                L.latLng(startCoords.lat, startCoords.lng),
                L.latLng(endCoords.lat, endCoords.lng)
            ],
            routeWhileDragging: false, showAlternatives: false, addWaypoints: false,
            draggableWaypoints: false, fitSelectedRoutes: true, show: false,
            router: L.Routing.osrmv1({
                serviceUrl: 'https://router.project-osrm.org/route/v1'
            }),
            formatter: new L.Routing.Formatter({ language: 'en', units: 'metric' })
        }).addTo(map);
        
        currentRoute = {
            start: startCoords, end: endCoords, startName: startCoords.displayName,
            endName: endCoords.displayName, timestamp: new Date().toISOString()
        };
        
        routeControl.on('routesfound', function(e) {
            const route = e.routes[0];
            
            currentRoute.distance = route.summary.totalDistance;
            currentRoute.duration = route.summary.totalTime;
            currentRoute.instructions = route.instructions;
            currentRoute.coordinates = route.coordinates;
            
            document.getElementById('startTripBtn').disabled = false;
            
            let instructionsHTML = '<h3>Route Instructions</h3>';
            instructionsHTML += `<p><i class="fas fa-road"></i> Total Distance: ${(route.summary.totalDistance / 1000).toFixed(1)} km</p>`;
            instructionsHTML += `<p><i class="fas fa-clock"></i> Estimated Time: ${formatDuration(route.summary.totalTime)}</p>`;
            instructionsHTML += '<ol>';
            route.instructions.forEach(instruction => {
                instructionsHTML += `<li>${instruction.text}</li>`;
            });
            instructionsHTML += '</ol>';
            
            document.getElementById('instructions').innerHTML = instructionsHTML;
            map.fitBounds(route.coordinates);
        });
        
        routeControl.on('routingerror', function(e) {
            document.getElementById('instructions').innerHTML = 
                '<div class="alert alert-danger"><i class="fas fa-exclamation-circle me-2"></i> Could not calculate route. Please check your start and destination.</div>';
        });
        
    }).catch(error => {
        document.getElementById('instructions').innerHTML = 
            '<div class="alert alert-danger"><i class="fas fa-exclamation-circle me-2"></i> Error calculating route. Please check your addresses and try again.</div>';
    });
}

function geocodeAddress(address) {
    return fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json`)
        .then(response => response.json())
        .then(data => {
            if (data && data.length > 0) {
                return {
                    lat: parseFloat(data[0].lat),
                    lng: parseFloat(data[0].lon),
                    displayName: data[0].display_name
                };
            }
            return null;
        });
}

function startTrip() {
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
    }
    
    if (!navigator.geolocation) {
        showToast("Geolocation is not supported by your browser.", "error");
        return;
    }
    
    activeTripId = 'TRP-' + Math.random().toString(16).substr(2, 6).toUpperCase();
    document.getElementById('tripIdDisplay').textContent = activeTripId;
    document.getElementById('tripIdContainer').style.display = 'block';
    
    document.getElementById('tripProgress').style.display = 'block';
    document.getElementById('progressBar').style.width = '0%';
    
    if (!currentPositionMarker) {
        currentPositionMarker = L.marker([0, 0], {
            icon: L.icon({
                iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
                iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34]
            }),
            zIndexOffset: 1000
        }).addTo(map);
    }
    
    watchId = navigator.geolocation.watchPosition(
        function(position) {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            
            currentPositionMarker.setLatLng([lat, lng]);
            
            if (routeControl && currentRoute) {
                const routes = routeControl.getPlan();
                if (routes && routes.waypoints.length >= 2) {
                    const destination = routes.waypoints[1].latLng;
                    const distanceToDestination = map.distance([lat, lng], destination);
                    const totalDistance = currentRoute.distance;
                    const progress = Math.min(100, Math.max(0, 100 - (distanceToDestination / totalDistance * 100)));
                    
                    document.getElementById('progressBar').style.width = `${progress}%`;
                    
                    currentPositionMarker.setPopupContent(
                        `<b>Your position</b><br>
                        Lat: ${lat.toFixed(6)}<br>
                        Lng: ${lng.toFixed(6)}<br>
                        Distance to destination: ${(distanceToDestination / 1000).toFixed(1)} km<br>
                        Progress: ${progress.toFixed(1)}%`
                    );
                }
            }
            
            map.setView([lat, lng], map.getZoom());
        },
        function(error) {
            showToast("Error getting your location: " + error.message, "error");
        },
        {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        }
    );
}

function showSaveTripModal() {
    if (!currentRoute) {
        showToast("No active trip to save. Please plan a trip first.", "error");
        return;
    }
    
    if (!localStorage.getItem('isLoggedIn')) {
        showToast("Please login to save trips", "warning");
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 2000);
        return;
    }
    
    const startName = currentRoute.startName.split(',')[0];
    const endName = currentRoute.endName.split(',')[0];
    document.getElementById('tripName').value = `${startName} to ${endName}`;
    
    if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
        const modal = new bootstrap.Modal(document.getElementById('saveTripModal'));
        modal.show();
    }
}

// Event listener setup for trip.html
function setupTripFormListeners() {
    const tripForm = document.getElementById('tripForm');
    if (tripForm) {
        tripForm.addEventListener('submit', function(e) {
            e.preventDefault();
            planTrip();
        });
    }

    document.getElementById('startTripBtn')?.addEventListener('click', startTrip);
    document.getElementById('saveTripBtn')?.addEventListener('click', showSaveTripModal);
    document.getElementById('currentLocationBtn')?.addEventListener('click', getCurrentLocation);
    document.getElementById('confirmSaveBtn')?.addEventListener('click', saveTrip);

    // Clear route confirmation logic
    document.getElementById('clearRouteBtn')?.addEventListener('click', function() {
        if (currentRoute || routeControl || currentPositionMarker) {
            const modal = new bootstrap.Modal(document.getElementById('confirmationModal'));
            modal.show();
        } else {
            performClearRoute();
        }
    });
    
    document.getElementById('confirmClearBtn')?.addEventListener('click', function() {
        performClearRoute();
        const modal = bootstrap.Modal.getInstance(document.getElementById('confirmationModal'));
        modal.hide();
    });
}


// ---------- EMERGENCY SERVICE DATA & LOGIC (From emergency.html) ----------

const emergencyData = [
  {Service_Name: "Apollo Hospital", Service_Type: "hospital", City: "kochi", Distance: 2.5, Open_24h: true, Features: ["Emergency Room", "Trauma Center", "Pharmacy", "Ambulance Service"], Contact: "0484-1234567"},
  {Service_Name: "Kochi City Police Station", Service_Type: "police", City: "kochi", Distance: 1.8, Open_24h: true, Features: ["Emergency Response", "FIR Services", "Women's Help Desk", "Traffic Police"], Contact: "100"},
  {Service_Name: "Lakeshore Hospital", Service_Type: "hospital", City: "kochi", Distance: 5.2, Open_24h: true, Features: ["ICU", "Emergency Care", "Cardiology", "Pharmacy"], Contact: "0484-1234567"},
  {Service_Name: "Medical Trust Hospital", Service_Type: "hospital", City: "kochi", Distance: 3.1, Open_24h: true, Features: ["24/7 Emergency", "Surgery", "Maternity", "Pharmacy"], Contact: "0484-1234567"},
  {Service_Name: "Ernakulam General Hospital", Service_Type: "hospital", City: "kochi", Distance: 2.2, Open_24h: true, Features: ["Government Hospital", "Emergency Services", "Outpatient Dept"], Contact: "0484-1234567"},
  {Service_Name: "Kochi Fire Station", Service_Type: "fire", City: "kochi", Distance: 3.5, Open_24h: true, Features: ["Fire Emergency", "Rescue Services", "Hazard Control"], Contact: "101"},
  {Service_Name: "Metro Pharmacy", Service_Type: "pharmacy", City: "kochi", Distance: 0.8, Open_24h: true, Features: ["24/7 Service", "Medicines", "Medical Supplies", "Home Delivery"], Contact: "0484-1234567"},
  {Service_Name: "Prime Urgent Care", Service_Type: "clinic", City: "kochi", Distance: 1.5, Open_24h: false, Features: ["Walk-in Clinic", "Minor Injuries", "Basic Lab Tests", "X-Ray"], Contact: "0484-1234567"},
  {Service_Name: "Amrita Institute of Medical Sciences", Service_Type: "hospital", City: "kochi", Distance: 7.3, Open_24h: true, Features: ["Multi-specialty", "Emergency Care", "Research Center", "Pharmacy"], Contact: "0484-1234567"},
  {Service_Name: "Kochi Traffic Police Station", Service_Type: "police", City: "kochi", Distance: 2.1, Open_24h: true, Features: ["Traffic Management", "Accident Response", "License Services"], Contact: "103"}
];

function getServiceTypeIcon(type) {
    const icons = {
        hospital: "fas fa-hospital",
        police: "fas fa-shield-alt",
        fire: "fas fa-fire-extinguisher",
        pharmacy: "fas fa-pills",
        clinic: "fas fa-clinic-medical"
    };
    return icons[type] || "fas fa-first-aid";
}

function getServiceImage(service) {
    const imageCategories = {
        hospital: [
            'https://images.unsplash.com/photo-1587351021759-3e566b3db4f7?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
            'https://images.pexels.com/photos/236380/pexels-photo-236380.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1'
        ],
        police: [
            'https://images.unsplash.com/photo-1604900504778-41a7b5236c3a?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
            'https://images.pexels.com/photos/5256836/pexels-photo-5256836.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1'
        ],
        fire: [
            'https://images.unsplash.com/photo-1615127181826-19e2c115836e?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
            'https://images.pexels.com/photos/4173251/pexels-photo-4173251.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1'
        ],
        pharmacy: [
            'https://images.unsplash.com/photo-1584614375600-ca0638f21602?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
            'https://images.pexels.com/photos/356040/pexels-photo-356040.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1'
        ],
        clinic: [
            'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
            'https://images.pexels.com/photos-4173251/pexels-photo-4173251.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1'
        ]
    };
    
    const categoryImages = imageCategories[service.Service_Type] || imageCategories.hospital;
    return categoryImages[Math.floor(Math.random() * categoryImages.length)];
}

function handleEmergencyAction(serviceName, contact) {
    if(confirm(`Call ${serviceName} at ${contact}?`)) {
        alert(`Calling ${serviceName} at ${contact}...\n\nIn a real application, this would initiate the phone call.`);
    }
}

function displayServices(services) {
    const resultsContainer = document.getElementById('serviceResults');
    if (!resultsContainer) return;
    resultsContainer.innerHTML = '';
    
    if (services.length === 0) {
        document.getElementById('noResults').style.display = 'block';
        return;
    }
    
    document.getElementById('noResults').style.display = 'none';
    
    services.forEach(service => {
        const serviceCard = document.createElement('div');
        serviceCard.className = 'col';
        
        const serviceImage = getServiceImage(service);
        const serviceTypeMap = {
            hospital: "Hospital",
            police: "Police Station",
            fire: "Fire Station",
            pharmacy: "Pharmacy",
            clinic: "Urgent Care Clinic"
        };
        const serviceTypeDisplay = serviceTypeMap[service.Service_Type] || "Emergency Service";
        
        serviceCard.innerHTML = `
            <div class="service-card">
                <div class="service-image" style="background-image: url('${serviceImage}')">
                    <i class="fas fa-hospital placeholder-icon" style="display: none;"></i>
                </div>
                <div class="service-details">
                    <span class="service-type">${serviceTypeDisplay}</span>
                    <h3>${service.Service_Name}</h3>
                    <p><i class="fas fa-map-marker-alt"></i> ${service.Distance} km away · ${service.City.charAt(0).toUpperCase() + service.City.slice(1)}</p>
                    
                    <div class="mb-2">
                        ${service.Features.map(feature => `<span class="feature-badge">${feature}</span>`).join('')}
                    </div>
                    
                    <div class="d-flex justify-content-between align-items-center mt-3">
                        <div>
                            <p class="mb-0"><i class="fas fa-phone"></i> <strong>${service.Contact}</strong></p>
                            <p class="mb-0 small">${service.Open_24h ? '<i class="fas fa-clock text-success"></i> Open 24/7' : '<i class="fas fa-clock"></i> Check hours'}</p>
                        </div>
                        <button class="emergency-btn" onclick="handleEmergencyAction('${service.Service_Name}', '${service.Contact}')">
                            <i class="fas fa-phone"></i> Call Now
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        resultsContainer.appendChild(serviceCard);
    });
}

function filterServices() {
    // Note: currentLocation is not used for filtering in this client-side demo
    const currentLocation = document.getElementById('currentLocation').value.toLowerCase();
    const serviceType = document.getElementById('serviceType').value;
    const radius = parseInt(document.getElementById('radius').value);
    const availability = document.getElementById('openNow').value;
    
    const loadingSpinner = document.getElementById('loadingSpinner');
    if (loadingSpinner) loadingSpinner.style.display = 'block';
    
    setTimeout(() => {
        let filteredServices = emergencyData;
        
        if (serviceType !== 'all') {
            filteredServices = filteredServices.filter(service => 
                service.Service_Type === serviceType
            );
        }
        
        filteredServices = filteredServices.filter(service => 
            service.Distance <= radius
        );
        
        if (availability === 'open' || availability === '24h') {
            filteredServices = filteredServices.filter(service => 
                service.Open_24h === true
            );
        }
        
        filteredServices.sort((a, b) => a.Distance - b.Distance);
        
        displayServices(filteredServices);
        
        if (loadingSpinner) loadingSpinner.style.display = 'none';
    }, 800);
}


// ---------- DOM CONTENT LOADED HANDLER (Main Initialization) ----------
document.addEventListener('DOMContentLoaded', function() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    checkAuth();
    setActiveNavLink();
    setupMobileNavigation();

    // --- Page Specific Initialization & Listeners ---

    // TRIP PLANNER Initialization
    if (currentPage === 'trip.html') {
        initMap();
        setupAutocomplete();
        setupTripFormListeners(); 
    }
    
    // LOGIN/REGISTER Logic
    if (currentPage === 'login.html') {
        if (!localStorage.getItem('users')) {
            localStorage.setItem('users', JSON.stringify([]));
        }
        
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', function(e) {
                e.preventDefault();
                const email = document.getElementById('email').value;
                const password = document.getElementById('password').value;
                
                const users = JSON.parse(localStorage.getItem('users'));
                const user = users.find(u => u.email === email && u.password === password);
                
                if (user) {
                    localStorage.setItem('isLoggedIn', 'true');
                    localStorage.setItem('currentUser', JSON.stringify(user));
                    showNotification('Login successful!', 'success');
                    window.location.href = 'index.html';
                } else {
                    showNotification('Invalid email or password!', 'error');
                }
            });
        }
        
        const registerForm = document.getElementById('registerForm');
        if (registerForm) {
            registerForm.addEventListener('submit', function(e) {
                e.preventDefault();
                const email = document.getElementById('regEmail').value;
                const password = document.getElementById('regPassword').value;
                const confirmPassword = document.getElementById('regConfirmPassword').value;
                const fullName = document.getElementById('regName').value;
                
                if (password !== confirmPassword) {
                    showNotification('Passwords do not match!', 'error');
                    return;
                }
                
                const users = JSON.parse(localStorage.getItem('users'));
                
                if (users.some(user => user.email === email)) {
                    showNotification('User with this email already exists!', 'error');
                    return;
                }
                
                const newUser = {
                    id: Date.now(), email, password, fullName, createdAt: new Date().toISOString()
                };
                
                users.push(newUser);
                localStorage.setItem('users', JSON.stringify(users));
                
                showNotification('Registration successful! Please login.', 'success');
                const loginTab = new bootstrap.Tab(document.querySelector('[data-bs-target="#login"]'));
                loginTab.show();
            });
        }
        
        document.getElementById('forgotPasswordForm')?.addEventListener('submit', function(e) {
            e.preventDefault();
            const email = document.getElementById('resetEmail').value;
            const users = JSON.parse(localStorage.getItem('users'));
            const user = users.find(u => u.email === email);
            
            if (user) {
                showNotification(`Password reset instructions would be sent to ${email}.`, 'info');
            } else {
                showNotification('No account found with this email address.', 'error');
            }
            const loginTab = new bootstrap.Tab(document.querySelector('[data-bs-target="#login"]'));
            loginTab.show();
        });
    }

    // SAVED TRIPS Logic
    if (currentPage === 'saved.html') {
        if (localStorage.getItem('isLoggedIn')) {
            loadSavedTrips();
        }
    }

    // HOTEL BOOKING Logic
    if (currentPage === 'hotel.html') {
        const hotelSearchForm = document.getElementById('hotelSearchForm');
        const applyFiltersBtn = document.getElementById('applyFilters');
        
        if (hotelSearchForm) {
            hotelSearchForm.addEventListener('submit', function(e) {
                e.preventDefault();
                filterHotels();
            });
        }
        if (applyFiltersBtn) {
            applyFiltersBtn.addEventListener('click', filterHotels);
        }
        
        const today = new Date();
        const tomorrow = new Date();
        tomorrow.setDate(today.getDate() + 1);
        if (document.getElementById('check-in')) document.getElementById('check-in').valueAsDate = today;
        if (document.getElementById('check-out')) document.getElementById('check-out').valueAsDate = tomorrow;
        
        displayHotels(hotelData.slice(0, 6));
    }
    
    // VEHICLE RENTAL Logic
    if (currentPage === 'vehicle.html') {
        const vehicleSearchForm = document.getElementById('vehicleSearchForm');
        const applyFiltersBtn = document.getElementById('applyFilters');
        
        if (vehicleSearchForm) {
            vehicleSearchForm.addEventListener('submit', function(e) {
                e.preventDefault();
                filterVehicles();
            });
        }
        if (applyFiltersBtn) {
            applyFiltersBtn.addEventListener('click', filterVehicles);
        }
        
        const today = new Date();
        const tomorrow = new Date();
        tomorrow.setDate(today.getDate() + 1);
        if (document.getElementById('pickupDate')) document.getElementById('pickupDate').valueAsDate = today;
        if (document.getElementById('dropoffDate')) document.getElementById('dropoffDate').valueAsDate = tomorrow;
        
        displayVehicles(vehicleData.slice(0, 6));
    }

    // ATTRACTIONS Logic
    if (currentPage === 'attractions.html') {
        document.getElementById('attractionSearchForm')?.addEventListener('submit', function(e) {
            e.preventDefault();
            filterAttractions();
        });
        
        document.getElementById('useCurrentLocation')?.addEventListener('click', function() {
            alert("In a real application, this would access your current location.\nFor now, we'll use Kochi as your location.");
            document.getElementById('currentLocation').value = "Kochi";
        });

        document.getElementById('radius')?.addEventListener('change', filterAttractions);
        document.getElementById('rating')?.addEventListener('change', filterAttractions);
        document.getElementById('sortBy')?.addEventListener('change', filterAttractions);
        document.getElementById('attractionType')?.addEventListener('change', filterAttractions);

        displayAttractions(attractionData.slice(0, 6));
    }
    
    // PETROL PUMPS Logic
    if (currentPage === 'petrol.html') {
        document.querySelector('.petrol-search .btn-primary')?.addEventListener('click', function() {
            const location = document.getElementById('location').value;
            const fuelType = document.getElementById('fuel-type').value;
            const radius = document.getElementById('radius').value;
            
            if (!location) {
                alert('Please enter your location to search for petrol pumps.');
                return;
            }
            
            alert(`Searching for ${fuelType} stations within ${radius} of ${location}`);
        });
        
        document.querySelectorAll('.petrol-card .service-btn').forEach(button => {
            button.addEventListener('click', function() {
                const stationName = this.closest('.petrol-card').querySelector('h3').textContent;
                alert(`Getting directions to ${stationName}`);
            });
        });
    }

    // EMERGENCY SERVICES Logic (NEW)
    if (currentPage === 'emergency.html') {
        document.getElementById('emergencySearchForm')?.addEventListener('submit', function(e) {
            e.preventDefault();
            filterServices();
        });

        document.getElementById('useCurrentLocation')?.addEventListener('click', function() {
            alert("In a real application, this would access your current location.\nFor now, we'll use Kochi as your location.");
            document.getElementById('currentLocation').value = "Kochi";
        });

        document.getElementById('radius')?.addEventListener('change', filterServices);
        document.getElementById('openNow')?.addEventListener('change', filterServices);
        document.getElementById('serviceType')?.addEventListener('change', filterServices);
        
        displayServices(emergencyData.slice(0, 6));
    }

    // WEATHER Widget Initialization (for index.html)
    const weatherWidget = document.getElementById('weatherWidget');
    if (weatherWidget) {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                function(position) {
                    getWeather(position.coords.latitude, position.coords.longitude);
                },
                function(error) {
                    console.log("Location access denied, using default location");
                    getWeatherByCity('Kochi');
                }
            );
        } else {
            console.log("Geolocation not supported, using default location");
            getWeatherByCity('Kochi');
        }
    }
});