# Health Hustle API Documentation

## Base URL
```
http://localhost:3000/api
```

## Authentication
All protected endpoints require a JWT token in the Authorization header:
```
Authorization: Bearer <jwt_token>
```

---

## 🔐 Authentication Endpoints

### 1. Send OTP
**Endpoint:** `POST /auth/send-otp`
**Authentication:** Not required
**Purpose:** Send OTP to user's phone number for login/registration

#### Request Body:
```json
{
  "phone": "+1234567890"
}
```

#### Response:
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "expiresIn": "5 minutes"
}
```

#### Use Cases:
- User wants to login/register
- User enters phone number and requests OTP
- System sends 6-digit OTP to phone

---

### 2. Verify OTP
**Endpoint:** `POST /auth/verify-otp`
**Authentication:** Not required
**Purpose:** Verify OTP and authenticate user

#### Request Body:
```json
{
  "phone": "+1234567890",
  "otp": "123456"
}
```

#### Response:
```json
{
  "success": true,
  "message": "OTP verified successfully",
  "user": {
    "id": "user_id",
    "name": "User Name",
    "phone": "+1234567890",
    "role": "user",
    "profileCompleted": true
  }
}
```

#### Use Cases:
- User enters OTP received on phone
- System validates OTP and creates/updates user
- Returns JWT token in Authorization header
- Frontend stores JWT for future API calls

---

## 👤 User Management Endpoints

### 3. User Dashboard
**Endpoint:** `GET /user/dashboard`
**Authentication:** Required (JWT Token)
**Purpose:** Get basic user information for dashboard

#### Response:
```json
{
  "success": true,
  "message": "User dashboard accessed successfully",
  "user": {
    "id": "user_id",
    "name": "User Name",
    "phone": "+1234567890",
    "role": "user"
  }
}
```

#### Use Cases:
- Display user profile in app header
- Show basic user info on dashboard
- Verify user authentication status

---

## 🏥 Health Data Endpoints

### 4. Bulk Health Data Upload
**Endpoint:** `PUT /user/health/bulk`
**Authentication:** Required (JWT Token)
**Purpose:** Upload multiple days of health data in one request

#### Request Body:
```json
{
  "health_data": [
    {
      "date": "2025-07-14",
      "data": {
        "steps": {
          "count": 8500,
          "distance": 6.2,
          "activeMinutes": 45
        },
        "water": {
          "consumed": 1500,
          "target": 2000
        },
        "heartRate": {
          "avgBpm": 72,
          "maxBpm": 95,
          "readings": [
            {
              "time": "09:30",
              "bpm": 72,
              "activity": "resting"
            }
          ]
        },
        "sleep": {
          "duration": 7.5,
          "quality": "good",
          "bedTime": "23:00",
          "wakeTime": "06:30"
        },
        "calories": {
          "consumed": 1800,
          "burned": 2200,
          "target": 2000
        }
      }
    },
    {
      "date": "2025-07-15",
      "data": {
        "steps": {"count": 9200},
        "water": {"consumed": 1800}
      }
    }
  ]
}
```

#### Response:
```json
{
  "success": true,
  "message": "Bulk health data processed",
  "summary": {
    "totalProcessed": 2,
    "successful": 2,
    "errors": 0
  },
  "results": [
    {
      "date": "2025-07-14",
      "status": "created",
      "recordId": "record_id_1"
    },
    {
      "date": "2025-07-15", 
      "status": "updated",
      "recordId": "record_id_2"
    }
  ]
}
```

#### Use Cases:
- **Primary Use:** Google Fit sync after user login
- Frontend fetches Google Fit data from last sync to now
- Sends all missing days in one API call
- Backend processes each day and creates/updates records
- Efficient batch processing for multiple days

---

### 5. Single Day Health Data Update
**Endpoint:** `PUT /user/health/:date`
**Authentication:** Required (JWT Token)
**Purpose:** Update health data for one specific date

#### URL Parameters:
- `date`: Date in YYYY-MM-DD format (e.g., 2025-07-16)

#### Request Body:
```json
{
  "steps": {"count": 8000},
  "water": {"consumed": 1200},
  "heartRate": {"avgBpm": 75}
}
```

#### Response:
```json
{
  "success": true,
  "message": "Daily health data updated successfully",
  "data": {
    "userId": "user_id",
    "date": "2025-07-16",
    "steps": {"count": 8000},
    "water": {"consumed": 1200},
    "heartRate": {"avgBpm": 75}
  }
}
```

#### Use Cases:
- **Manual data entry:** User manually adds health data
- **Real-time updates:** User updates today's data while using app
- **Corrections:** User fixes incorrect data for specific day
- **Progressive updates:** User adds more data throughout the day

---

### 6. Get Today's Health Data
**Endpoint:** `GET /user/health/today`
**Authentication:** Required (JWT Token)
**Purpose:** Get health data for current date

#### Response:
```json
{
  "success": true,
  "message": "Today's health data retrieved successfully",
  "data": {
    "userId": "user_id",
    "date": "2025-07-16",
    "steps": {"count": 8000, "target": 10000},
    "water": {"consumed": 1200, "target": 2000},
    "heartRate": {"avgBpm": 75, "maxBpm": 95},
    "sleep": {"duration": 7.5, "quality": "good"},
    "calories": {"consumed": 1800, "burned": 2200}
  },
  "date": "2025-07-16"
}
```

#### Use Cases:
- **Dashboard display:** Show today's health metrics
- **Progress tracking:** Display daily goal progress
- **Real-time updates:** Refresh today's data after user input
- **Widget data:** Populate health widgets on home screen

---

### 7. Get Specific Day Health Data
**Endpoint:** `GET /user/health/:date`
**Authentication:** Required (JWT Token)
**Purpose:** Get health data for any specific date

#### URL Parameters:
- `date`: Date in YYYY-MM-DD format (e.g., 2025-07-15)

#### Response:
```json
{
  "success": true,
  "message": "Daily health data retrieved successfully",
  "data": {
    "userId": "user_id",
    "date": "2025-07-15",
    "steps": {"count": 9200, "distance": 7.1},
    "water": {"consumed": 1800, "target": 2000},
    "heartRate": {"avgBpm": 78, "readings": [...]},
    "sleep": {"duration": 8, "quality": "excellent"}
  }
}
```

#### Use Cases:
- **Historical data:** View past health data
- **Weekly/Monthly views:** Get data for specific dates in calendar
- **Comparisons:** Compare current day with previous days
- **Reports:** Generate health reports for specific periods

---

## 📊 Health Data Schema

### Complete Health Data Structure:
```json
{
  "heartRate": {
    "readings": [
      {
        "time": "09:30",
        "bpm": 72,
        "activity": "resting"
      }
    ],
    "avgBpm": 72,
    "maxBpm": 95,
    "minBpm": 60
  },
  "steps": {
    "count": 8500,
    "target": 10000,
    "distance": 6.2,
    "activeMinutes": 45
  },
  "water": {
    "consumed": 1500,
    "target": 2000,
    "entries": [
      {
        "time": "08:30",
        "amount": 250,
        "notes": "Morning water"
      }
    ]
  },
  "calories": {
    "consumed": 1800,
    "burned": 2200,
    "target": 2000,
    "bmr": 1600
  },
  "sleep": {
    "duration": 7.5,
    "quality": "good",
    "bedTime": "23:00",
    "wakeTime": "06:30",
    "deepSleep": 2.5,
    "lightSleep": 5.0
  },
  "bodyMetrics": {
    "weight": 70.5,
    "bodyFat": 15.2,
    "muscleMass": 55.8,
    "bmi": 22.5,
    "bodyTemperature": 36.8
  },
  "workouts": [
    {
      "type": "cardio",
      "duration": 30,
      "caloriesBurned": 300,
      "exercises": ["running", "cycling"],
      "intensity": "moderate",
      "notes": "Morning run"
    }
  ],
  "nutrition": {
    "meals": [
      {
        "type": "breakfast",
        "foods": [
          {
            "name": "Oatmeal",
            "quantity": "1 cup",
            "calories": 150,
            "protein": 5,
            "carbs": 30,
            "fats": 3
          }
        ],
        "totalCalories": 150
      }
    ],
    "totalProtein": 75,
    "totalCarbs": 200,
    "totalFats": 60
  },
  "mood": {
    "level": 8,
    "note": "Feeling great today!",
    "factors": ["good_sleep", "exercise"],
    "stressLevel": 3
  },
  "vitals": {
    "bloodPressure": {
      "systolic": 120,
      "diastolic": 80,
      "readings": [
        {
          "time": "08:00",
          "systolic": 120,
          "diastolic": 80
        }
      ]
    },
    "bloodSugar": {
      "avg": 95,
      "readings": [
        {
          "time": "07:00",
          "value": 85,
          "type": "fasting"
        }
      ]
    }
  },
  "medications": [
    {
      "name": "Vitamin D",
      "dosage": "1000 IU",
      "taken": true,
      "timeScheduled": "08:00",
      "timeTaken": "08:15",
      "notes": "With breakfast"
    }
  ]
}
```

---

## 🔍 Error Responses

### Common Error Formats:
```json
{
  "success": false,
  "error": "Error message description"
}
```

### HTTP Status Codes:
- `200` - Success
- `400` - Bad Request (invalid data)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (data doesn't exist)
- `500` - Internal Server Error

---

## 🚀 Integration Flow

### 1. User Authentication Flow:
```
1. POST /auth/send-otp (phone number)
2. POST /auth/verify-otp (phone + OTP)
3. Store JWT token from response headers
4. Use JWT for all subsequent API calls
```

### 2. Health Data Sync Flow:
```
1. User opens app
2. Check last sync timestamp (stored locally)
3. Fetch Google Fit data from last sync to now
4. PUT /user/health/bulk (send all missing data)
5. Update local sync timestamp
6. GET /user/health/today (display dashboard)
```

### 3. Manual Data Entry Flow:
```
1. User manually enters health data
2. PUT /user/health/:date (update specific day)
3. GET /user/health/today (refresh display)
```

---

## 💡 Best Practices

### Frontend Integration:
- Store JWT securely after login
- Handle token expiration gracefully
- Implement retry logic for failed requests
- Cache health data locally for offline access
- Batch multiple updates using bulk endpoint

### Error Handling:
- Always check `success` field in responses
- Display user-friendly error messages
- Implement proper loading states
- Handle network connectivity issues

### Performance:
- Use bulk endpoint for multiple days
- Implement pagination for large date ranges
- Cache frequently accessed data
- Minimize API calls with smart data fetching

---

This API provides a complete foundation for health tracking applications with Google Fit integration, manual data entry, and comprehensive health metrics storage.
