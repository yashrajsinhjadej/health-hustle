#!/bin/bash

echo "🚀 Creating 50 new users with complete OTP verification..."
echo "This process will:"
echo "1. Send OTP to 50 different phone numbers"
echo "2. Extract OTP from each response"
echo "3. Verify each OTP to complete registration"
echo ""

# Array of 50 different phone numbers (new numbers to avoid duplicates)
phones=(
  "9123456789" "9234567890" "9345678901" "9456789012" "9567890123"
  "9678901234" "9789012345" "9890123456" "9901234567" "9012345678"
  "8213456789" "8324567890" "8435678901" "8546789012" "8657890123"
  "8768901234" "8879012345" "8980123456" "8091234567" "8192345678"
  "7213456789" "7324567890" "7435678901" "7546789012" "7657890123"
  "7768901234" "7879012345" "7980123456" "7091234567" "7192345678"
  "6123456789" "6234567890" "6345678901" "6456789012" "6567890123"
  "6678901234" "6789012345" "6890123456" "6901234567" "6012345678"
  "5123456789" "5234567890" "5345678901" "5456789012" "5567890123"
  "5678901234" "5789012345" "5890123456" "5901234567" "5012345678"
)

success_count=0
error_count=0
verification_success=0
verification_error=0

# Create temporary file to store OTP data
temp_file="/tmp/otp_data.txt"
> "$temp_file"

echo "📱 Phase 1: Sending OTP to 50 phone numbers..."
echo ""

for i in "${!phones[@]}"; do
  phone=${phones[$i]}
  request_num=$((i + 1))
  
  echo "[$request_num/50] Sending OTP to: $phone"
  
  # Send OTP request
  response=$(curl -s -X POST http://localhost:3000/api/auth/send-otp \
    -H "Content-Type: application/json" \
    -d "{\"phone\": \"$phone\"}")
  
  echo "Response: $response"
  
  # Check if request was successful and extract OTP
  if echo "$response" | grep -q "OTP sent successfully"; then
    success_count=$((success_count + 1))
    
    # Extract OTP from response using grep and sed
    otp=$(echo "$response" | grep -o '"otp":"[^"]*"' | sed 's/"otp":"//g' | sed 's/"//g')
    
    if [ ! -z "$otp" ]; then
      echo "✅ SUCCESS - OTP: $otp"
      # Store phone and OTP for verification phase
      echo "$phone:$otp" >> "$temp_file"
    else
      echo "⚠️ SUCCESS but couldn't extract OTP"
    fi
  else
    error_count=$((error_count + 1))
    echo "❌ FAILED"
  fi
  
  echo "---"
  
  # Wait between requests to respect rate limiting
  if [ $request_num -lt 50 ]; then
    echo "Waiting 2 seconds before next request..."
    sleep 2
  fi
done

echo ""
echo "📋 Phase 1 Results:"
echo "   - OTP requests sent: 50"
echo "   - Successful: $success_count"
echo "   - Failed: $error_count"
echo ""

# Phase 2: Verify all OTPs
echo "🔐 Phase 2: Verifying OTPs to complete registrations..."
echo ""

while IFS=':' read -r phone otp; do
  if [ ! -z "$phone" ] && [ ! -z "$otp" ]; then
    echo "Verifying OTP for phone: $phone (OTP: $otp)"
    
    # Verify OTP
    verify_response=$(curl -s -X POST http://localhost:3000/api/auth/verify-otp \
      -H "Content-Type: application/json" \
      -d "{\"phone\": \"$phone\", \"otp\": \"$otp\"}")
    
    echo "Verify Response: $verify_response"
    
    # Check if verification was successful
    if echo "$verify_response" | grep -q "Login successful"; then
      verification_success=$((verification_success + 1))
      echo "✅ VERIFICATION SUCCESS"
    else
      verification_error=$((verification_error + 1))
      echo "❌ VERIFICATION FAILED"
    fi
    
    echo "---"
    sleep 1
  fi
done < "$temp_file"

# Cleanup
rm -f "$temp_file"

echo ""
echo "🎉 COMPLETE USER REGISTRATION PROCESS FINISHED!"
echo ""
echo "📊 FINAL RESULTS:"
echo "   Phase 1 (OTP Send):"
echo "   - Total OTP requests: 50"
echo "   - Successful: $success_count"
echo "   - Failed: $error_count"
echo "   - Success rate: $(echo "scale=1; $success_count * 100 / 50" | bc -l 2>/dev/null || echo "N/A")%"
echo ""
echo "   Phase 2 (OTP Verify):"
echo "   - Total verifications: $verification_success + $verification_error = $((verification_success + verification_error))"
echo "   - Successful: $verification_success"
echo "   - Failed: $verification_error"
echo "   - Success rate: $(echo "scale=1; $verification_success * 100 / $((verification_success + verification_error))" | bc -l 2>/dev/null || echo "N/A")%"
echo ""
echo "🎯 NEW USERS CREATED: $verification_success"
