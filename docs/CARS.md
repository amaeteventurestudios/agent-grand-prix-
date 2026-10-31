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

Garage pictures are cropped to 640×360 WebP in `assets/cars/`; home-screen pictures come from
`hero.py` at 1200×675 in `assets/cars/hero/`.

- `art/cars/hyper.py`: the car kit. Panels are lofted from key-point cross-sections with sharp
  creases where a key is flagged sharp (so the body reads as cut panels, not soft tubes), and each
  paint rule gets `Q(x, u, s, inner, cap)`: `u` is the position round the section in keys, so a
  stripe can follow a crease. `build_car(SPEC, lod)` assembles body, sidepods with inlets, wheel
  pods, arc fenders, floor, diffuser, wings, fin, airbox, canopy, halo, mirrors, suspension and
  wheels.
- `art/cars/base.py`: shared shapes on top of the kit (body rows, cockpit and engine cover, sidepods,
  front and rear wings, wheel-pod rows, rear hoods).
- `art/cars/carkit.py`: the livery constants and low-level helpers the kit uses.
- Each car file (`falcon.py` … `tempest.py`) is a `SPEC`: shape tables plus paint rules.

The livery mask is painted into vertex colours: R main colour, G accent, B lights, A finish. Each channel
stores the distance to that colour's nearest edge, and the game (`js/cars.js`) tints it per team with
a one-pixel step at 0.5, so stripes stay crisp; a stripe needs at least two vertices across. Three
levels of detail per car: about 26–41k, 8–11k and 2–3k triangles, 190–270 KB compressed.

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
