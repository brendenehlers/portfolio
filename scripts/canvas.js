Pts.namespace( window )

let space

// config params
const count = 2500 // number of points
const maxRadius = 300 // how far the points can go out when being generated
const semimajor = 1.5 // controls how far the points go on the x-axis
const semiminor = 1 // controls how far the points go on the y-axis
const rate = 2.3 // used in the expDis function
const brightnessFalloff = 200
const colors = ["#be4bff", "#d742ff", "#e3bcff", "#f5bfff", "#c1a1c3", "#f", "#f", "#f", "#f", "#f"]

// set these to undefined to disable
const brightnessCache = undefined
const expDisCache = new Map()

let pointSize = 1
if (isSmallScreen()) {
  pointSize = 0.5
}

// how fast the points move
let rotAmt = 3 * Const.one_degree 
if (isSmallScreen()) {
  rotAmt = 6 * Const.one_degree
}

class Polar {
  constructor(r, angle) {
    this.r = r
    this.angle = angle
    this.id = this.r.toFixed(0).toString() + "," + this.angle.toFixed(0).toString(); 
  }
}

const createSpace = () => {


  // controls the center points
  const center = new Pt()
  center.x = Math.floor(window.innerWidth / 2)
  center.y = Math.floor(5 * window.innerHeight / 8)

  space = new CanvasSpace("canvas")
    .setup({ resize: true, bgcolor: "black", retina: true })

  const form = space.getForm()

  let pts = []
  for ( let i = 0; i < count; i++ ) {
    const p = center.clone()

    // distribute the points along the radius
    const x = expDis(Math.random(), rate, true)
    p.x += maxRadius * x

    // rotate the point randomly around the circle
    const angle = Math.random() * Const.two_pi
    p.rotate2D(angle, center)

    pts.push(p)
  }

  space.add({ 
    animate: (time, ftime) => {

      // cause an error in this function to see the initial setup
      form.fillOnly("#fff").point(center, 5, "circle")

      for (let i = 0; i < pts.length; i++) {
        const polar = convertPolar(centerizePoint(pts[i], center), semimajor, semiminor)
        const brightness = calcPointBrightness(polar)
        pts[i] = calcNextPoint(polar, center, semimajor, semiminor, rotAmt)
        form.fillOnly(colors[i % colors.length]).alpha(brightness).point(pts[i], pointSize, "circle")
      }
    }
  })

  space.bindMouse().bindTouch().play()
}

$(document).ready(() => {
  createSpace()
})

$(window).resize(() => {
  space.removeAll()
  $('canvas').remove()
  createSpace()
})

function calcNextPoint(polar, center, semimajor, semiminor, angle) {
  let initialAngle = polar.angle
  if (initialAngle < 0) {
    initialAngle += 2 * Math.PI
  }

  const finalAngle = initialAngle + angle * Math.PI / 180

  const newX = semimajor * polar.r * Math.cos(finalAngle)
  const newY = semiminor * polar.r * Math.sin(finalAngle)

  return new Pt(center.x + newX, center.y + newY)
}


function calcPointBrightness(polar) {
  if (brightnessCache && brightnessCache.has(polar.id)) {
    return brightnessCache.get(polar.id)
  }

  const scaledAngle = (polar.angle) / 2 + (Math.PI / 4)
  let brightness = 0.7 * Math.abs(Math.sin(scaledAngle)) + 0.3

  brightness *= expDis(polar.r / brightnessFalloff, 1)

  brightnessCache && brightnessCache.set(polar.id, brightness)

  return brightness
}

function centerizePoint(point, center) {
  return new Pt(point.x - center.x, point.y - center.y)
}

function expDis(x, rate, disableCache) {
  if (rate < 0) {
    throw new Error("rate cannot be less than 0")
  }
  
  if (x < 0) return 0

  const cacheKey = x.toFixed(2)
  if (!disableCache && (expDisCache && expDisCache.has(cacheKey))) {
    return expDisCache.get(cacheKey)
  }

  // modified to only return [0, 1]
  const res = Math.exp(-(rate * x))

  ;(!disableCache && expDisCache) && expDisCache.set(cacheKey, res)

  return res
}

function convertPolar(point, semimajor, semiminor) {
  const x = (point.x * point.x) / (semimajor * semimajor)
  const y = (point.y * point.y) / (semiminor * semiminor)
  const r = Math.sqrt(x + y)


  const top = (point.y * semimajor)
  const bot = (point.x * semiminor)
  let angle = Math.atan2( top, bot )

  return new Polar(r, angle)
}

function storeObjectInLocalStorage(key, obj) {
  const serialized = JSON.stringify(Array.from(map.entries()))
  localStorage.setItem(key, serialized)
}


function isSmallScreen() {
  return window.innerWidth < 600
}