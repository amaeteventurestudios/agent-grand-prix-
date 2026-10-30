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

`cars/hero.py` renders the phone app's car pictures (`assets/cars/hero/<name>.webp`): a low three-quarter view in a dark cobalt studio with a glossy floor, a blue rim light and a lime kicker, in the brand livery.

```
blender -b art/cars/falcon.blend -P art/cars/hero.py -- /tmp/falcon.png '#1f4fd8' '#0e1424' '#c6ff3d' 1200 675
```

The safety car (`cars/safety.py`) is built and exported by its own script: a long-bonnet grand tourer in its own colours (vertex colour is the real colour), with roof lamps `lamp_L` and `lamp_R` as separate meshes the game flashes.

```
blender -b --factory-startup -P art/cars/safety.py [-- --render /tmp/sc]
npx gltfpack@0.22.0 -i assets/vehicles/safety/safety.glb -o assets/vehicles/safety/safety.glb -cc -kn -km -vp 14 -vn 8 -vc 8
```

Livery mask: each vertex colour is R primary paint, G secondary paint, B light strip, and A finish (1 paint, 0.55 carbon, 0.8 metal, 0 rubber). `js/cars.js` tints it with each team's colours, so one file serves every livery.

Budgets per car: LOD 0 at most 30k triangles, LOD 1 8k, LOD 2 1.5k, and 450 KB compressed. Blender's GPL licence doesn't apply to the models; gltfpack is MIT.

## People

`people/people.py` builds the pit crew: a joint skeleton wrapped by Blender's Skin modifier, a helmet with a dark visor, a standing and a kneeling pose, two levels of detail each. Vertex colour alpha 1 marks the overalls that `js/paddock.js` tints with the team colour.

```
blender -b --factory-startup -P art/people/people.py
```

`people/driver.py` builds the drivers for the podium celebration (`js/ceremony.js`) from the same figure, in the poses a driver needs after the flag: waving, one- and two-handed fist pumps, two running strides, a leap onto the crew, a trophy over the head, and champagne sprayed or poured. One level of detail, compressed with gltfpack.

```
blender -b --factory-startup -P art/people/driver.py
npx gltfpack@0.22.0 -i assets/people/driver.glb -o assets/people/driver.glb -cc -kn -km -vp 14 -vn 8 -vc 8
```

## Buildings

`buildings/buildings.py` builds the city kit used for Lagos (venues with `kit: true` in `js/data.js`): nine buildings at their real size in metres (glass tower on a podium, 1970s office slab with concrete fins, round tower, stepped tower with terrace gardens, slim apartment tower, block of flats, low office on a colonnade, shophouse with an awning, house with a tin roof), each in two levels of detail (LOD 1 drops the balconies, fins, tanks and masts). Windows are not modelled: the facade shader in `js/kit.js` draws them, so each corner colour carries the wall's style and whether it takes the building's paint (see the comment at the top of the script). Cycles bakes ambient occlusion for all of them into one shared 1024 px map that travels inside the GLB.

```
blender -b --factory-startup -P art/buildings/buildings.py [-- --render /tmp/kit.png]
npx gltfpack@0.22.0 -i assets/buildings/city.glb -o assets/buildings/city.glb -cc -kn -ke -km -vp 14 -vn 8 -vc 8
```

`-ke` keeps each building's numbers (height, footprint, floor height, window width) as node extras, which `cityKit()` in `js/kit.js` reads. The whole kit is about 260 KB, most of it the shading map, and only loads at venues that use it.
