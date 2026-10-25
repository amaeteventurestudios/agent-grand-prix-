# The cars

Ten cars, modelled in Blender from the reference pictures, built entirely by script (no hand
modelling, no textures). Every team in a race drives its own car; yours is the one you pick.

| # | Car | Family | Strengths (corners / braking / straights) |
|---|---|---|---|
| 01 | Falcon | wheel pods | +1 / 0 / −1 |
| 02 | Vortex | open wheel | 0 / −1 / +1 |
| 03 | Spectre | wheel pods | −1 / +1 / 0 |
| 04 | Raptor | open wheel, hooked front fenders | +1 / −1 / 0 |
| 05 | Arrowhead | open wheel | −1 / 0 / +1 |
| 06 | Manta | wheel pods, wing on hoops | 0 / +1 / −1 |
| 07 | Kestrel | open wheel, big fenders | +½ / +½ / −1 |
| 08 | Stratos | wheel pods | +1 / −½ / −½ |
| 09 | Peregrine | open wheel, fenders | −½ / −½ / +1 |
| 10 | Tempest | open wheel, turbine fan | −½ / +1 / −½ |

## Building a car

Blender 4.2, headless:

```
blender -b --factory-startup -P art/cars/build.py -- <car>        # art/cars/<car>.blend + assets/vehicles/<car>/<car>.glb
blender -b art/cars/<car>.blend -P art/cars/render.py -- out 0 c1 c2 glow 34,side   # check renders
blender -b art/cars/<car>.blend -P art/cars/thumb.py -- out.png c1 c2 glow          # garage picture
npx gltfpack@0.22.0 -i <glb> -o <glb> -cc -kn -km -vp 14 -vn 8 -vc 8                 # compress for the game
```

Then base64 the compressed GLB into `<car>.glb.js` (hosts that won't serve `.glb` load that).
Garage pictures are cropped to 640×360 WebP in `assets/cars/`.

- `art/cars/carkit.py`: lofts, wings, wheels, fender shells, and the livery mask painter.
- `art/cars/openwheel.py`: the shared builder. A car file gives its shape tables (monocoque,
  sidepods), wing elements, fenders or wheel nacelles, extras, and paint rules.
- Each car file (`falcon.py` … `tempest.py`) is shape tables plus paint rules.

The livery mask is painted into vertex colours: R main colour, G accent, B lights, A finish. The game
tints it per team (`js/cars.js`), with a one-pixel step at 0.5 so edges stay crisp. Three levels of
detail per car: about 33–43k, 9–11k and 2–3k triangles.

## Strengths

`js/carspec.js` holds the cars, their default colours and strengths. One step of any strength is
worth 0.4% of lap time averaged over every circuit, and each car's steps add up to zero, so no car is
faster overall: a straights car gains at Monza-like tracks and gives it back at twisty ones. The
engine applies them through the speed plan (`js/track.js` `driverPlan`: cornering grip, braking and
corner entry, top speed) and in qualifying. A race set up without `car` uses the neutral car, so the
regression baseline is unchanged.

`node tools/test/cars.test.mjs [races]` checks the sums, the calendar average, that every car is
among the three fastest somewhere, and that over many races (each car driving for every team in
turn) no car finishes better or worse on average.

## Showroom

`js/showroom.js`: the car on a turntable in your colours. Drag to spin, pinch or scroll to zoom.
The Cutaway slider slices away the half facing you (a clipping plane) and shows what is inside
(driver, fuel cell, battery, power unit, gearbox, radiators, brakes) with callouts that never cover
each other. Your main, accent and light colours are saved with your team.
