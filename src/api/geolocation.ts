export interface CurrentPosition {
  lat: number
  lng: number
}

export function getCurrentPosition(): Promise<CurrentPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('position unavailable'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })
      },
      (error) => {
        switch (error.code) {
          case 1:
            reject(new Error('permission denied'))
            break
          case 2:
            reject(new Error('position unavailable'))
            break
          case 3:
            reject(new Error('timeout'))
            break
          default:
            reject(new Error('position unavailable'))
        }
      },
    )
  })
}
