export const verifyEmailTemplate = (otp) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;700&display=swap');
    body { margin: 0; padding: 0; background-color: #ffffff; font-family: 'Inter', sans-serif; -webkit-font-smoothing: antialiased; }
    .main { width: 100%; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; }
    .header { padding: 40px; border-bottom: 1px solid #f3f4f6; position: relative; }
    .brand { font-size: 11px; letter-spacing: 4px; text-transform: uppercase; color: #1a1a1a; font-weight: 700; }
    .protocol { font-size: 9px; color: #9ca3af; letter-spacing: 2px; margin-top: 4px; }
    .content { padding: 80px 40px; }
    h1 { font-size: 48px; font-weight: 300; letter-spacing: -2px; line-height: 1; margin: 0; color: #1a1a1a; text-transform: uppercase; }
    h1 i { font-family: serif; font-style: italic; color: #8DAA9D; text-transform: lowercase; }
    p { font-size: 15px; color: #4b5563; line-height: 1.6; margin: 40px 0; max-width: 400px; }
    .otp-display { border-top: 1px solid #1a1a1a; border-bottom: 1px solid #1a1a1a; padding: 30px 0; margin: 40px 0; }
    .otp-value { font-size: 54px; font-weight: 700; letter-spacing: 12px; color: #1a1a1a; }
    .footer { padding: 40px; background-color: #f9fafb; font-size: 10px; color: #9ca3af; letter-spacing: 1px; text-transform: uppercase; }
  </style>
</head>
<body>
  <div class="main">
    <div class="header">
      <div class="brand">SOVEREIGN</div>
      <div class="protocol">THE SOVEREIGN PROTOCOL — 2026</div>
    </div>
    <div class="content">
      <h1>Security <i>meets</i> Intelligence</h1>
      <p>A refined synthesis of clinical excellence and artificial intelligence. Use this key to authenticate your access.</p>
      
      <div class="otp-display">
        <div class="otp-value">${otp}</div>
      </div>
      
      <p style="font-size: 12px; color: #9ca3af;">This code is ephemeral and will expire in 10:00 minutes.</p>
    </div>
    <div class="footer">
      &copy; SOVEREIGN HEALTHBOOK / PRECISION CARE
    </div>
  </div>
</body>
</html>
`;

export const welcomeEmailTemplate = (userName, loginLink) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; padding: 0; background-color: #ffffff; font-family: 'Inter', sans-serif; }
    .main { width: 100%; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; }
    .header { padding: 40px; border-bottom: 1px solid #f3f4f6; }
    .content { padding: 80px 40px; }
    .brand { font-size: 11px; letter-spacing: 4px; text-transform: uppercase; font-weight: 700; }
    h1 { font-size: 52px; font-weight: 300; letter-spacing: -3px; line-height: 0.9; margin: 0; color: #1a1a1a; }
    h1 b { font-family: serif; font-style: italic; font-weight: 400; color: #8DAA9D; }
    p { font-size: 16px; color: #4b5563; line-height: 1.8; margin: 30px 0 50px 0; }
    .cta-button { display: inline-block; background-color: #2D302D; color: #ffffff !important; padding: 20px 40px; text-decoration: none; font-size: 12px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; }
    .grid-accent { margin-top: 60px; padding-top: 30px; border-top: 1px solid #f3f4f6; display: flex; }
    .meta-item { font-size: 9px; color: #9ca3af; letter-spacing: 1px; margin-right: 30px; }
  </style>
</head>
<body>
  <div class="main">
    <div class="header">
      <div class="brand">SOVEREIGN</div>
    </div>
    <div class="content">
      <h1>Humanity <b>is</b> Verified.</h1>
      <p>Welcome, ${userName.split(' ')[0]}. You have successfully synthesized your profile with the Sovereign Protocol. Your bespoke path to longevity begins now.</p>
      
      <a href="${loginLink}" class="cta-button">Enter Dashboard &rarr;</a>

      <div class="grid-accent">
        <span class="meta-item">01 / DISCOVERY</span>
        <span class="meta-item">02 / DIAGNOSIS</span>
        <span class="meta-item">03 / LONGEVITY</span>
      </div>
    </div>
  </div>
</body>
</html>
`;
export const doctorInvitationTemplate = (doctorName, specialization, loginLink) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;700&display=swap');
    body { margin: 0; padding: 0; background-color: #ffffff; font-family: 'Inter', sans-serif; -webkit-font-smoothing: antialiased; }
    .main { width: 100%; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; }
    .header { padding: 40px; border-bottom: 1px solid #f3f4f6; }
    .brand { font-size: 11px; letter-spacing: 4px; text-transform: uppercase; color: #1a1a1a; font-weight: 700; }
    .content { padding: 80px 40px; }
    .faculty-tag { font-size: 9px; color: #8DAA9D; letter-spacing: 2px; text-transform: uppercase; font-weight: 700; margin-bottom: 15px; display: block; }
    h1 { font-size: 44px; font-weight: 300; letter-spacing: -2px; line-height: 1.1; margin: 0; color: #1a1a1a; }
    h1 b { font-family: serif; font-style: italic; font-weight: 400; color: #8DAA9D; }
    p { font-size: 15px; color: #4b5563; line-height: 1.8; margin: 30px 0; }
    .role-box { background-color: #f9fafb; padding: 20px; border-left: 2px solid #1a1a1a; margin: 40px 0; }
    .role-label { font-size: 9px; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px; }
    .role-value { font-size: 16px; font-weight: 700; color: #1a1a1a; margin-top: 5px; }
    .cta-button { display: inline-block; background-color: #1a1a1a; color: #ffffff !important; padding: 20px 40px; text-decoration: none; font-size: 11px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; }
    .footer { padding: 40px; border-top: 1px solid #f3f4f6; font-size: 9px; color: #9ca3af; letter-spacing: 1px; text-transform: uppercase; }
  </style>
</head>
<body>
  <div class="main">
    <div class="header">
      <div class="brand">SOVEREIGN</div>
    </div>
    <div class="content">
      <span class="faculty-tag">Faculty Appointment</span>
      <h1>Welcome to the <b>Clinical</b> Collective.</h1>
      <p>Dr. ${doctorName.split(' ')[0]}, your credentials have been verified. You are now synthesized with the Sovereign medical network as a specialist in your field.</p>
      
      <div class="role-box">
        <div class="role-label">Designated Specialization</div>
        <div class="role-value">${specialization}</div>
      </div>

      <a href="${loginLink}" class="cta-button">Access Faculty Portal &rarr;</a>
    </div>
    <div class="footer">
      SOVEREIGN HEALTHBOOK / PRECISION CARE FACULTY DIVISION — 2026
    </div>
  </div>
</body>
</html>
`;

/**
 * Video Consultation Reminder — sent ~10 min before appointment
 * @param {string} recipientName - Doctor or Patient first name
 * @param {string} role - "Doctor" | "Patient"
 * @param {string} otherPartyName - The other participant's name
 * @param {string} dateTimeStr - Formatted date/time string e.g. "06 Mar 2026, 02:30 PM"
 * @param {string} meetingLink - Full URL to join the video call
 */
export const videoReminderTemplate = (recipientName, role, otherPartyName, dateTimeStr, meetingLink) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;700&display=swap');
    body { margin: 0; padding: 0; background-color: #ffffff; font-family: 'Inter', sans-serif; -webkit-font-smoothing: antialiased; }
    .main { width: 100%; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; }
    .header { padding: 40px; border-bottom: 1px solid #f3f4f6; }
    .brand { font-size: 11px; letter-spacing: 4px; text-transform: uppercase; color: #1a1a1a; font-weight: 700; }
    .content { padding: 60px 40px; }
    .alert-tag { font-size: 9px; color: #8DAA9D; letter-spacing: 2px; text-transform: uppercase; font-weight: 700; margin-bottom: 15px; display: block; }
    h1 { font-size: 40px; font-weight: 300; letter-spacing: -2px; line-height: 1.1; margin: 0; color: #1a1a1a; }
    h1 b { font-family: serif; font-style: italic; font-weight: 400; color: #8DAA9D; }
    p { font-size: 15px; color: #4b5563; line-height: 1.8; margin: 25px 0; }
    .detail-box { background-color: #f9fafb; padding: 20px; border-left: 2px solid #8DAA9D; margin: 30px 0; }
    .detail-label { font-size: 9px; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px; }
    .detail-value { font-size: 15px; font-weight: 700; color: #1a1a1a; margin-top: 4px; }
    .cta-button { display: inline-block; background-color: #1a1a1a; color: #ffffff !important; padding: 20px 40px; text-decoration: none; font-size: 11px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; }
    .footer { padding: 30px 40px; border-top: 1px solid #f3f4f6; font-size: 9px; color: #9ca3af; letter-spacing: 1px; text-transform: uppercase; }
  </style>
</head>
<body>
  <div class="main">
    <div class="header">
      <div class="brand">SOVEREIGN</div>
    </div>
    <div class="content">
      <span class="alert-tag">Consultation in 5 Minutes</span>
      <h1>Your <b>Video</b> Session Awaits</h1>
      <p>${recipientName}, your upcoming video consultation is about to begin. Please ensure your camera and microphone are ready.</p>

      <div class="detail-box">
        <div class="detail-label">${role === "Doctor" ? "Patient" : "Doctor"}</div>
        <div class="detail-value">${otherPartyName}</div>
      </div>
      <div class="detail-box">
        <div class="detail-label">Scheduled Time</div>
        <div class="detail-value">${dateTimeStr}</div>
      </div>

      <a href="${meetingLink}" class="cta-button">Join Video Call &rarr;</a>

      <p style="font-size: 12px; color: #9ca3af; margin-top: 40px;">If you did not book this appointment, please ignore this email.</p>
    </div>
    <div class="footer">
      SOVEREIGN HEALTHBOOK / PRECISION CARE — 2026
    </div>
  </div>
</body>
</html>
`;

/**
 * Appointment Booked — sent to doctor when a patient books
 * @param {string} doctorName
 * @param {string} patientName
 * @param {string} dateTimeStr - e.g. "06 Mar 2026, 02:30 PM"
 * @param {string} consultationType - "in-clinic" | "video"
 * @param {number} fee
 */
export const appointmentBookedDoctorTemplate = (doctorName, patientName, dateTimeStr, consultationType, fee, meetingLink) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;700&display=swap');
    body { margin: 0; padding: 0; background-color: #ffffff; font-family: 'Inter', sans-serif; -webkit-font-smoothing: antialiased; }
    .main { width: 100%; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; }
    .header { padding: 40px; border-bottom: 1px solid #f3f4f6; }
    .brand { font-size: 11px; letter-spacing: 4px; text-transform: uppercase; color: #1a1a1a; font-weight: 700; }
    .content { padding: 60px 40px; }
    .alert-tag { font-size: 9px; color: #8DAA9D; letter-spacing: 2px; text-transform: uppercase; font-weight: 700; margin-bottom: 15px; display: block; }
    h1 { font-size: 40px; font-weight: 300; letter-spacing: -2px; line-height: 1.1; margin: 0; color: #1a1a1a; }
    h1 b { font-family: serif; font-style: italic; font-weight: 400; color: #8DAA9D; }
    p { font-size: 15px; color: #4b5563; line-height: 1.8; margin: 25px 0; }
    .detail-box { background-color: #f9fafb; padding: 20px; border-left: 2px solid #8DAA9D; margin: 20px 0; }
    .detail-label { font-size: 9px; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px; }
    .detail-value { font-size: 15px; font-weight: 700; color: #1a1a1a; margin-top: 4px; }
    .cta-button { display: inline-block; background-color: #1a1a1a; color: #ffffff !important; padding: 20px 40px; text-decoration: none; font-size: 11px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; margin-top: 10px; }
    .footer { padding: 30px 40px; border-top: 1px solid #f3f4f6; font-size: 9px; color: #9ca3af; letter-spacing: 1px; text-transform: uppercase; }
  </style>
</head>
<body>
  <div class="main">
    <div class="header">
      <div class="brand">SOVEREIGN</div>
    </div>
    <div class="content">
      <span class="alert-tag">New Appointment Booked</span>
      <h1>New <b>Patient</b> Booking</h1>
      <p>Dr. ${doctorName}, a new appointment has been booked with you. Please review the details below.</p>

      <div class="detail-box">
        <div class="detail-label">Patient</div>
        <div class="detail-value">${patientName}</div>
      </div>
      <div class="detail-box">
        <div class="detail-label">Date &amp; Time</div>
        <div class="detail-value">${dateTimeStr}</div>
      </div>
      <div class="detail-box">
        <div class="detail-label">Consultation Type</div>
        <div class="detail-value">${consultationType === 'video' ? 'Video Consultation' : 'In-Clinic Visit'}</div>
      </div>
      <div class="detail-box">
        <div class="detail-label">Consultation Fee</div>
        <div class="detail-value">\u20B9${fee}</div>
      </div>

      ${consultationType === 'video' 
        ? (meetingLink 
            ? `<a href="${meetingLink}" class="cta-button">Join Video Call &rarr;</a>`
            : `<div style="background-color: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; margin-top: 20px;">
                 <strong>Note:</strong> The secure meeting link will be emailed to you <strong>5 minutes before</strong> the consultation begins.
               </div>`)
        : ''}

      <p style="font-size: 12px; color: #9ca3af; margin-top: 40px;">Log in to your dashboard to manage this appointment.</p>
    </div>
    <div class="footer">
      SOVEREIGN HEALTHBOOK / PRECISION CARE — 2026
    </div>
  </div>
</body>
</html>
`;

/**
 * Appointment Booked — sent to patient when booking is confirmed
 */
export const appointmentBookedPatientTemplate = (patientName, doctorName, dateTimeStr, consultationType, fee, meetingLink) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;700&display=swap');
    body { margin: 0; padding: 0; background-color: #ffffff; font-family: 'Inter', sans-serif; -webkit-font-smoothing: antialiased; }
    .main { width: 100%; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; }
    .header { padding: 40px; border-bottom: 1px solid #f3f4f6; }
    .brand { font-size: 11px; letter-spacing: 4px; text-transform: uppercase; color: #1a1a1a; font-weight: 700; }
    .content { padding: 60px 40px; }
    .alert-tag { font-size: 9px; color: #8DAA9D; letter-spacing: 2px; text-transform: uppercase; font-weight: 700; margin-bottom: 15px; display: block; }
    h1 { font-size: 40px; font-weight: 300; letter-spacing: -2px; line-height: 1.1; margin: 0; color: #1a1a1a; }
    h1 b { font-family: serif; font-style: italic; font-weight: 400; color: #8DAA9D; }
    p { font-size: 15px; color: #4b5563; line-height: 1.8; margin: 25px 0; }
    .detail-box { background-color: #f9fafb; padding: 20px; border-left: 2px solid #8DAA9D; margin: 20px 0; }
    .detail-label { font-size: 9px; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px; }
    .detail-value { font-size: 15px; font-weight: 700; color: #1a1a1a; margin-top: 4px; }
    .cta-button { display: inline-block; background-color: #1a1a1a; color: #ffffff !important; padding: 20px 40px; text-decoration: none; font-size: 11px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; margin-top: 10px; }
    .footer { padding: 30px 40px; border-top: 1px solid #f3f4f6; font-size: 9px; color: #9ca3af; letter-spacing: 1px; text-transform: uppercase; }
  </style>
</head>
<body>
  <div class="main">
    <div class="header">
      <div class="brand">SOVEREIGN</div>
    </div>
    <div class="content">
      <span class="alert-tag">Appointment Confirmed</span>
      <h1>Your <b>Consultation</b> is Booked</h1>
      <p>${patientName}, your appointment has been successfully booked. Here are your consultation details.</p>

      <div class="detail-box">
        <div class="detail-label">Doctor</div>
        <div class="detail-value">Dr. ${doctorName}</div>
      </div>
      <div class="detail-box">
        <div class="detail-label">Date &amp; Time</div>
        <div class="detail-value">${dateTimeStr}</div>
      </div>
      <div class="detail-box">
        <div class="detail-label">Consultation Type</div>
        <div class="detail-value">${consultationType === 'video' ? 'Video Consultation' : 'In-Clinic Visit'}</div>
      </div>
      <div class="detail-box">
        <div class="detail-label">Consultation Fee</div>
        <div class="detail-value">\u20B9${fee}</div>
      </div>

      ${consultationType === 'video' 
        ? (meetingLink 
            ? `<a href="${meetingLink}" class="cta-button">Join Video Call &rarr;</a>
               <p style="font-size: 12px; color: #9ca3af;">Save this link — you will use it to join the video consultation at your scheduled time.</p>`
            : `<div style="background-color: #fefce8; padding: 20px; border: 1px solid #fef08a; color: #854d0e; font-size: 14px; margin-top: 20px;">
                 <strong>Meeting Link Protocol:</strong> For security, your video consultation link will be emailed to you <strong>5 minutes before</strong> the scheduled start time.
               </div>`)
        : ''}

      <p style="font-size: 12px; color: #9ca3af; margin-top: 40px;">If you did not book this appointment, please contact support.</p>
    </div>
    <div class="footer">
      SOVEREIGN HEALTHBOOK / PRECISION CARE — 2026
    </div>
  </div>
</body>
</html>
`;