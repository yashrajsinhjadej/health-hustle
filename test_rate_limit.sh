#!/bin/bash

echo "🧪 Testing Phone-Specific Rate Limiting..."
echo "This will test if multiple different phone numbers can send OTP simultaneously"
echo ""

# Test 1: Same phone number multiple times (should be rate limited)
echo "📱 Test 1: Same phone number (9123456789) - 3 requests in quick succession"
echo "Expected: First request succeeds, others get rate limited"

for i in {1..3}; do
  echo "Request $i:"
  curl -X POST http://localhost:3000/api/auth/send-otp \
    -H "Content-Type: application/json" \
    -d '{"phone": "9123456789"}' \
    --silent | jq '.'
  echo "---"
  sleep 1
done

echo ""
echo "📱 Test 2: Different phone numbers (should all succeed)"
echo "Expected: All requests succeed as they're different phone numbers"

phones=("9111111111" "9222222222" "9333333333" "9444444444" "9555555555")

for i in "${!phones[@]}"; do
  phone=${phones[$i]}
  echo "Request $((i+1)) - Phone: $phone"
  curl -X POST http://localhost:3000/api/auth/send-otp \
    -H "Content-Type: application/json" \
    -d "{\"phone\": \"$phone\"}" \
    --silent | jq '.'
  echo "---"
  sleep 1
done

echo ""
echo "🎉 Rate limiting test completed!"
echo "Check the results above to verify phone-specific rate limiting is working."
