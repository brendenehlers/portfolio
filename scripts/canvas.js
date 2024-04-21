Pts.namespace( window )

const createSpace = () => {
  // config params
  const count = 2500 // number of points
  const maxRadius = 300 // how far the points can go out when being generated
  const semimajor = 1.5 // controls how far the points go on the x-axis
  const semiminor = 1 // controls how far the points go on the y-axis
  const rotAmt = 7 * Const.one_degree // how fast the points move
  const rate = 2.3 // used in the expDis function
  const colors = ["#be4bff", "#d742ff", "#e3bcff", "#f5bfff", "#c1a1c3", "#f", "#f", "#f", "#f", "#f"]

  // controls the center points
  const center = new Pt()
  center.x = Math.floor(window.innerWidth / 2)
  center.y = Math.floor(5 * window.innerHeight / 8)

  const space = new CanvasSpace("canvas")
    .setup({ resize: true, bgcolor: "black", retina: true })

  const form = space.getForm()

  let pts = []
  for ( let i = 0; i < count; i++ ) {
    const p = center.clone()

    // distribute the points along the radius
    const x = expDis(Math.random(), rate)
    p.x += maxRadius * x

    // rotate the point randomly around the circle
    const angle = Math.random() * Const.two_pi
    p.rotate2D(angle, center)

    pts.push(p)
  }

  space.add({ 
    animate: (time, ftime) => {
      // cause an error in this function to see the initial setup
      form.fillOnly("#fff").point(center, 8, "circle")

      for (let i = 0; i < pts.length; i++) {
        const brightness = calcPointBrightness(pts[i], center, semimajor, semiminor)
        pts[i] = calcNextPoint(pts[i], center, semimajor, semiminor, rotAmt)
        form.fillOnly(colors[i % colors.length]).alpha(brightness).point(pts[i], 1, "circle")
      }
    }
  })

  space.bindMouse().bindTouch().play()
}

createSpace()

function calcNextPoint(point, center, semimajor, semiminor, angle) {
  const newPt = point.clone()
  const initialPoint = centerizePoint(newPt, center)

  let [r, initialAngle] = convertPolar(initialPoint, semimajor, semiminor)

  if (initialAngle < 0) {
    initialAngle += 2 * Math.PI
  }

  const finalAngle = initialAngle + angle * Math.PI / 180

  const newX = semimajor * r * Math.cos(finalAngle)
  const newY = semiminor * r * Math.sin(finalAngle)

  newPt.x = center.x + newX
  newPt.y = center.y + newY

  return newPt
}

function calcPointBrightness(point, center, semimajor, semiminor) {
  const normPoint = centerizePoint(point, center)
  const [r, angle] = convertPolar(normPoint, semimajor, semiminor)

  const scaledAngle = (angle) / 2 + (Math.PI / 4)
  let brightness = 0.7 * Math.abs(Math.sin(scaledAngle)) + 0.3

  brightness *= expDis(r / 150, 1)

  return brightness
}

function centerizePoint(point, center) {
  return new Pt(point.x - center.x, point.y - center.y)
}

function expDis(x, rate) {
  if (rate < 0) {
    throw new Error("rate cannot be less than 0")
  }
  
  if (x < 0) return 0

  // modified to only return [0, 1]
  return Math.exp(-(rate * x))
}

function convertPolar(point, semimajor, semiminor) {
  const x = (point.x * point.x) / (semimajor * semimajor)
  const y = (point.y * point.y) / (semiminor * semiminor)
  const r = Math.sqrt(x + y)

  const top = (point.y * semimajor)
  const bot = (point.x * semiminor)
  let angle = Math.atan2( top, bot )

  return [r, angle]
}