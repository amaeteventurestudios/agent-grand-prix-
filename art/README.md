# Art pipeline

Cars are modelled by Python scripts that run inside Blender 4.2 LTS with no screen. Nothing is drawn by hand, so any car can be rebuilt from its script.

- `cars/carkit.py`: shared helpers (lofted cross-sections, wings, fenders, wheels, livery mask). Cars use the game's car frame: X forward, Y left, Z up, wheels at x = ±1.55 and y = ±0.83, radius 0.34.
- `cars/<name>.py`: one car, built at three levels of detail.
- `cars/build.py`: builds a car, saves `cars/<name>.blend` and exports `assets/vehicles/<name>/<name>.glb`.
- `cars/render.py`: renders a four-view check sheet with a team livery.

```
blender -b --factory-startup -P art/cars/build.py -- falcon
npx gltfpack@0.22.0 -i assets/vehicles/falcon/falcon.glb -o assets/vehicles/falcon/falcon.glb -cc -kn -km -vp 14 -vn 8 -vc 8
blender -b art/cars/falcon.blend -P art/cars/render.py -- /tmp/falcon 0 '#c6f53a' '#1b1d22'
```

Livery mask: each vertex colour is R primary paint, G secondary paint, B light strip, and A finish (1 paint, 0.55 carbon, 0.8 metal, 0 rubber). `js/cars.js` tints it with each team's colours, so one file serves every livery.

Budgets per car: LOD 0 at most 30k triangles, LOD 1 8k, LOD 2 1.5k, and 450 KB compressed. Blender's GPL licence doesn't apply to the models; gltfpack is MIT.

## People

`people/people.py` builds the pit crew: a joint skeleton wrapped by Blender's Skin modifier, a helmet with a dark visor, a standing and a kneeling pose, two levels of detail each. Vertex colour alpha 1 marks the overalls that `js/paddock.js` tints with the team colour.

```
blender -b --factory-startup -P art/people/people.py
```
