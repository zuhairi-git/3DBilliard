// A large screen alone is not evidence of a TV: desktop monitors should stay 3D.
export function isTvBrowser(userAgent: string) {
  return /Smart[- _]?TV|HbbTV|NetCast|Web0S|WebOS|Tizen.+TV|TV.+Tizen|Viera|BRAVIA|AFT[A-Z0-9]+|Android.+(?:TV|SHIELD)|Roku|CrKey|GoogleTV|AppleTV|CE-HTML|Opera TV/i.test(userAgent);
}

export function shouldAskAboutTv(userAgent: string, preference: string | null) {
  return preference !== 'on' && preference !== 'off' && isTvBrowser(userAgent);
}
