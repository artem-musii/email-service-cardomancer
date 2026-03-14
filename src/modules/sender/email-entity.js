const SUBJECTS = {
  'otp-code': 'Your verification code',
  'welcome': 'Welcome!'
}

const getSubject = (template) => SUBJECTS[template] || template

export { getSubject }
