#!/bin/bash

echo "Starting bulk user creation with 50 different phone numbers..."
echo "This will take approximately 5-10 minutes due to rate limiting..."

# Array of 50 different phone numbers
phones=(
  "9123456789" "9234567890" "9345678901" "9456789012" "9567890123"
  "9678901234" "9789012345" "9890123456" "9901234567" "9012345678"
  "9113456789" "9224567890" "9335678901" "9446789012" "9557890123"
  "9668901234" "9779012345" "9880123456" "9991234567" "9102345678"
  "9213456789" "9324567890" "9435678901" "9546789012" "9657890123"
  "9768901234" "9879012345" "9980123456" "9091234567" "9192345678"
  "9293456789" "9394567890" "9495678901" "9596789012" "9697890123"
  "9798901234" "9899012345" "9990123456" "9001234567" "9112345678"
  "9223456789" "9334567890" "9445678901" "9556789012" "9667890123"
  "9778901234" "9889012345" "9900123456" "9011234567" "9122345678"
)

success_count=0
error_count=0

for i in "${!phones[@]}"; do
  phone=${phones[$i]}
  request_num=$((i + 1))
  
  echo "[$request_num/50] Sending OTP to: $phone"
  
  response=$(curl -s -X POST http://localhost:3000/api/auth/send-otp \
    -H "Content-Type: application/json" \
    -d "{\"phone\": \"$phone\"}")
  
  echo "Response: $response"
  
  # Check if request was successful
  if echo "$response" | grep -q "OTP sent successfully"; then
    success_count=$((success_count + 1))
    echo "✅ SUCCESS ($success_count/$request_num)"
  else
    error_count=$((error_count + 1))
    echo "❌ FAILED ($error_count/$request_num)"
  fi
  
  echo "---"
  
  # Wait 15 seconds between requests to avoid rate limiting
  if [ $request_num -lt 50 ]; then
    echo "Waiting 15 seconds before next request..."
    sleep 15
  fi
done

echo ""
echo "🎉 BULK USER CREATION COMPLETED!"
echo "📊 Results:"
echo "   - Total requests: 50"
echo "   - Successful: $success_count"
echo "   - Failed: $error_count"
echo "   - Success rate: $(echo "scale=1; $success_count * 100 / 50" | bc)%"
