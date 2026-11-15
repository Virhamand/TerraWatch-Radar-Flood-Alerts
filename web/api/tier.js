// node_modules/@turf/helpers/dist/esm/index.js
var earthRadius = 63710088e-1;
var factors = {
  centimeters: earthRadius * 100,
  centimetres: earthRadius * 100,
  cm: earthRadius * 100,
  degrees: 360 / (2 * Math.PI),
  deg: 360 / (2 * Math.PI),
  feet: earthRadius * 3.28084,
  ft: earthRadius * 3.28084,
  inches: earthRadius * 39.37,
  in: earthRadius * 39.37,
  kilometers: earthRadius / 1e3,
  kilometres: earthRadius / 1e3,
  km: earthRadius / 1e3,
  meters: earthRadius,
  metres: earthRadius,
  m: earthRadius,
  miles: earthRadius / 1609.344,
  mi: earthRadius / 1609.344,
  millimeters: earthRadius * 1e3,
  millimetres: earthRadius * 1e3,
  mm: earthRadius * 1e3,
  nauticalmiles: earthRadius / 1852,
  nmi: earthRadius / 1852,
  radians: 1,
  rad: 1,
  yards: earthRadius * 1.0936,
  yd: earthRadius * 1.0936
};
function feature(geom, properties, options = {}) {
  const feat = { type: "Feature" };
  if (options.id === 0 || options.id) {
    feat.id = options.id;
  }
  if (options.bbox) {
    feat.bbox = options.bbox;
  }
  feat.properties = properties || {};
  feat.geometry = geom;
  return feat;
}
function point(coordinates, properties, options = {}) {
  if (!coordinates) {
    throw new Error("coordinates is required");
  }
  if (!Array.isArray(coordinates)) {
    throw new Error("coordinates must be an Array");
  }
  if (coordinates.length < 2) {
    throw new Error("coordinates must be at least 2 numbers long");
  }
  if (!isNumber(coordinates[0]) || !isNumber(coordinates[1])) {
    throw new Error("coordinates must contain numbers");
  }
  const geom = {
    type: "Point",
    coordinates
  };
  return feature(geom, properties, options);
}
function polygon(coordinates, properties, options = {}) {
  for (const ring of coordinates) {
    if (ring.length < 4) {
      throw new Error(
        "Each LinearRing of a Polygon must have 4 or more Positions."
      );
    }
    if (ring[ring.length - 1].length !== ring[0].length) {
      throw new Error("First and last Position are not equivalent.");
    }
    for (let j = 0; j < ring[ring.length - 1].length; j++) {
      if (ring[ring.length - 1][j] !== ring[0][j]) {
        throw new Error("First and last Position are not equivalent.");
      }
    }
  }
  const geom = {
    type: "Polygon",
    coordinates
  };
  return feature(geom, properties, options);
}
function lineString(coordinates, properties, options = {}) {
  if (coordinates.length < 2) {
    throw new Error("coordinates must be an array of two or more positions");
  }
  const geom = {
    type: "LineString",
    coordinates
  };
  return feature(geom, properties, options);
}
function featureCollection(features, options = {}) {
  const fc = { type: "FeatureCollection" };
  if (options.id) {
    fc.id = options.id;
  }
  if (options.bbox) {
    fc.bbox = options.bbox;
  }
  fc.features = features;
  return fc;
}
function multiLineString(coordinates, properties, options = {}) {
  const geom = {
    type: "MultiLineString",
    coordinates
  };
  return feature(geom, properties, options);
}
function radiansToLength(radians, units = "kilometers") {
  const factor = factors[units];
  if (!factor) {
    throw new Error(units + " units is invalid");
  }
  return radians * factor;
}
function lengthToRadians(distance2, units = "kilometers") {
  const factor = factors[units];
  if (!factor) {
    throw new Error(units + " units is invalid");
  }
  return distance2 / factor;
}
function radiansToDegrees(radians) {
  const normalisedRadians = radians % (2 * Math.PI);
  return normalisedRadians * 180 / Math.PI;
}
function degreesToRadians(degrees) {
  const normalisedDegrees = degrees % 360;
  return normalisedDegrees * Math.PI / 180;
}
function convertLength(length, originalUnit = "kilometers", finalUnit = "kilometers") {
  if (!(length >= 0)) {
    throw new Error("length must be a positive number");
  }
  return radiansToLength(lengthToRadians(length, originalUnit), finalUnit);
}
function isNumber(num) {
  return !isNaN(num) && num !== null && !Array.isArray(num);
}

// node_modules/@turf/invariant/dist/esm/index.js
function getCoord(coord) {
  if (!coord) {
    throw new Error("coord is required");
  }
  if (!Array.isArray(coord)) {
    if (coord.type === "Feature" && coord.geometry !== null && coord.geometry.type === "Point") {
      return [...coord.geometry.coordinates];
    }
    if (coord.type === "Point") {
      return [...coord.coordinates];
    }
  }
  if (Array.isArray(coord) && coord.length >= 2 && !Array.isArray(coord[0]) && !Array.isArray(coord[1])) {
    return [...coord];
  }
  throw new Error("coord must be GeoJSON Point or an Array of numbers");
}
function getCoords(coords) {
  if (Array.isArray(coords)) {
    return coords;
  }
  if (coords.type === "Feature") {
    if (coords.geometry !== null) {
      return coords.geometry.coordinates;
    }
  } else {
    if (coords.coordinates) {
      return coords.coordinates;
    }
  }
  throw new Error(
    "coords must be GeoJSON Feature, Geometry Object or an Array"
  );
}
function featureOf(feature2, type, name) {
  if (!feature2) {
    throw new Error("No feature passed");
  }
  if (!name) {
    throw new Error(".featureOf() requires a name");
  }
  if (!feature2 || feature2.type !== "Feature" || !feature2.geometry) {
    throw new Error(
      "Invalid input to " + name + ", Feature with geometry required"
    );
  }
  if (!feature2.geometry || feature2.geometry.type !== type) {
    throw new Error(
      "Invalid input to " + name + ": must be a " + type + ", given " + feature2.geometry.type
    );
  }
}
function getGeom(geojson) {
  if (geojson.type === "Feature") {
    return geojson.geometry;
  }
  return geojson;
}

// node_modules/@turf/distance/dist/esm/index.js
function distance(from, to, options = {}) {
  var coordinates1 = getCoord(from);
  var coordinates2 = getCoord(to);
  var dLat = degreesToRadians(coordinates2[1] - coordinates1[1]);
  var dLon = degreesToRadians(coordinates2[0] - coordinates1[0]);
  var lat1 = degreesToRadians(coordinates1[1]);
  var lat2 = degreesToRadians(coordinates2[1]);
  var a = Math.pow(Math.sin(dLat / 2), 2) + Math.pow(Math.sin(dLon / 2), 2) * Math.cos(lat1) * Math.cos(lat2);
  return radiansToLength(
    2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)),
    options.units
  );
}

// node_modules/@turf/meta/dist/esm/index.js
function coordEach(geojson, callback, excludeWrapCoord) {
  if (geojson === null) return;
  var j, k, l, geometry, stopG, coords, geometryMaybeCollection, wrapShrink = 0, coordIndex = 0, isGeometryCollection, type = geojson.type, isFeatureCollection = type === "FeatureCollection", isFeature = type === "Feature", stop = isFeatureCollection ? geojson.features.length : 1;
  for (var featureIndex = 0; featureIndex < stop; featureIndex++) {
    geometryMaybeCollection = isFeatureCollection ? (
      // @ts-expect-error: Known type conflict
      geojson.features[featureIndex].geometry
    ) : isFeature ? (
      // @ts-expect-error: Known type conflict
      geojson.geometry
    ) : geojson;
    isGeometryCollection = geometryMaybeCollection ? geometryMaybeCollection.type === "GeometryCollection" : false;
    stopG = isGeometryCollection ? geometryMaybeCollection.geometries.length : 1;
    for (var geomIndex = 0; geomIndex < stopG; geomIndex++) {
      var multiFeatureIndex = 0;
      var geometryIndex = 0;
      geometry = isGeometryCollection ? geometryMaybeCollection.geometries[geomIndex] : geometryMaybeCollection;
      if (geometry === null) continue;
      coords = geometry.coordinates;
      var geomType = geometry.type;
      wrapShrink = excludeWrapCoord && (geomType === "Polygon" || geomType === "MultiPolygon") ? 1 : 0;
      switch (geomType) {
        case null:
          break;
        case "Point":
          if (
            // @ts-expect-error: Known type conflict
            callback(
              coords,
              coordIndex,
              featureIndex,
              multiFeatureIndex,
              geometryIndex
            ) === false
          )
            return false;
          coordIndex++;
          multiFeatureIndex++;
          break;
        case "LineString":
        case "MultiPoint":
          for (j = 0; j < coords.length; j++) {
            if (
              // @ts-expect-error: Known type conflict
              callback(
                coords[j],
                coordIndex,
                featureIndex,
                multiFeatureIndex,
                geometryIndex
              ) === false
            )
              return false;
            coordIndex++;
            if (geomType === "MultiPoint") multiFeatureIndex++;
          }
          if (geomType === "LineString") multiFeatureIndex++;
          break;
        case "Polygon":
        case "MultiLineString":
          for (j = 0; j < coords.length; j++) {
            for (k = 0; k < coords[j].length - wrapShrink; k++) {
              if (
                // @ts-expect-error: Known type conflict
                callback(
                  coords[j][k],
                  coordIndex,
                  featureIndex,
                  multiFeatureIndex,
                  geometryIndex
                ) === false
              )
                return false;
              coordIndex++;
            }
            if (geomType === "MultiLineString") multiFeatureIndex++;
            if (geomType === "Polygon") geometryIndex++;
          }
          if (geomType === "Polygon") multiFeatureIndex++;
          break;
        case "MultiPolygon":
          for (j = 0; j < coords.length; j++) {
            geometryIndex = 0;
            for (k = 0; k < coords[j].length; k++) {
              for (l = 0; l < coords[j][k].length - wrapShrink; l++) {
                if (
                  // @ts-expect-error: Known type conflict
                  callback(
                    coords[j][k][l],
                    coordIndex,
                    featureIndex,
                    multiFeatureIndex,
                    geometryIndex
                  ) === false
                )
                  return false;
                coordIndex++;
              }
              geometryIndex++;
            }
            multiFeatureIndex++;
          }
          break;
        case "GeometryCollection":
          for (j = 0; j < geometry.geometries.length; j++)
            if (
              // @ts-expect-error: Known type conflict
              coordEach(geometry.geometries[j], callback, excludeWrapCoord) === false
            )
              return false;
          break;
        default:
          throw new Error("Unknown Geometry Type");
      }
    }
  }
}
function geomEach(geojson, callback) {
  var i, j, g, geometry, stopG, geometryMaybeCollection, isGeometryCollection, featureProperties, featureBBox, featureId, featureIndex = 0, isFeatureCollection = geojson.type === "FeatureCollection", isFeature = geojson.type === "Feature", stop = isFeatureCollection ? geojson.features.length : 1;
  for (i = 0; i < stop; i++) {
    geometryMaybeCollection = isFeatureCollection ? (
      // @ts-expect-error: Known type conflict
      geojson.features[i].geometry
    ) : isFeature ? (
      // @ts-expect-error: Known type conflict
      geojson.geometry
    ) : geojson;
    featureProperties = isFeatureCollection ? (
      // @ts-expect-error: Known type conflict
      geojson.features[i].properties
    ) : isFeature ? (
      // @ts-expect-error: Known type conflict
      geojson.properties
    ) : {};
    featureBBox = isFeatureCollection ? (
      // @ts-expect-error: Known type conflict
      geojson.features[i].bbox
    ) : isFeature ? (
      // @ts-expect-error: Known type conflict
      geojson.bbox
    ) : void 0;
    featureId = isFeatureCollection ? (
      // @ts-expect-error: Known type conflict
      geojson.features[i].id
    ) : isFeature ? (
      // @ts-expect-error: Known type conflict
      geojson.id
    ) : void 0;
    isGeometryCollection = geometryMaybeCollection ? geometryMaybeCollection.type === "GeometryCollection" : false;
    stopG = isGeometryCollection ? geometryMaybeCollection.geometries.length : 1;
    for (g = 0; g < stopG; g++) {
      geometry = isGeometryCollection ? geometryMaybeCollection.geometries[g] : geometryMaybeCollection;
      if (geometry === null) {
        if (
          // @ts-expect-error: Known type conflict
          callback(
            // @ts-expect-error: Known type conflict
            null,
            featureIndex,
            featureProperties,
            featureBBox,
            featureId
          ) === false
        )
          return false;
        continue;
      }
      switch (geometry.type) {
        case "Point":
        case "LineString":
        case "MultiPoint":
        case "Polygon":
        case "MultiLineString":
        case "MultiPolygon": {
          if (
            // @ts-expect-error: Known type conflict
            callback(
              geometry,
              featureIndex,
              featureProperties,
              featureBBox,
              featureId
            ) === false
          )
            return false;
          break;
        }
        case "GeometryCollection": {
          for (j = 0; j < geometry.geometries.length; j++) {
            if (
              // @ts-expect-error: Known type conflict
              callback(
                geometry.geometries[j],
                featureIndex,
                featureProperties,
                featureBBox,
                featureId
              ) === false
            )
              return false;
          }
          break;
        }
        default:
          throw new Error("Unknown Geometry Type");
      }
    }
    featureIndex++;
  }
}
function flattenEach(geojson, callback) {
  geomEach(geojson, function(geometry, featureIndex, properties, bbox, id) {
    var type = geometry === null ? null : geometry.type;
    switch (type) {
      case null:
      case "Point":
      case "LineString":
      case "Polygon":
        if (
          // @ts-expect-error: Known type conflict
          callback(
            feature(geometry, properties, { bbox, id }),
            featureIndex,
            0
          ) === false
        )
          return false;
        return;
    }
    var geomType;
    switch (type) {
      case "MultiPoint":
        geomType = "Point";
        break;
      case "MultiLineString":
        geomType = "LineString";
        break;
      case "MultiPolygon":
        geomType = "Polygon";
        break;
    }
    for (
      var multiFeatureIndex = 0;
      // @ts-expect-error: Known type conflict
      multiFeatureIndex < geometry.coordinates.length;
      multiFeatureIndex++
    ) {
      var coordinate = geometry.coordinates[multiFeatureIndex];
      var geom = {
        type: geomType,
        coordinates: coordinate
      };
      if (
        // @ts-expect-error: Known type conflict
        callback(feature(geom, properties), featureIndex, multiFeatureIndex) === false
      )
        return false;
    }
  });
}
function segmentEach(geojson, callback) {
  flattenEach(geojson, function(feature2, featureIndex, multiFeatureIndex) {
    var segmentIndex = 0;
    if (!feature2.geometry) return;
    var type = feature2.geometry.type;
    if (type === "Point" || type === "MultiPoint") return;
    var previousCoords;
    var previousFeatureIndex = 0;
    var previousMultiIndex = 0;
    var prevGeomIndex = 0;
    if (
      // @ts-expect-error: Known type conflict
      coordEach(
        feature2,
        function(currentCoord, coordIndex, featureIndexCoord, multiPartIndexCoord, geometryIndex) {
          if (
            // @ts-expect-error: Known type conflict
            previousCoords === void 0 || featureIndex > previousFeatureIndex || multiPartIndexCoord > previousMultiIndex || geometryIndex > prevGeomIndex
          ) {
            previousCoords = currentCoord;
            previousFeatureIndex = featureIndex;
            previousMultiIndex = multiPartIndexCoord;
            prevGeomIndex = geometryIndex;
            segmentIndex = 0;
            return;
          }
          var currentSegment = lineString(
            // @ts-expect-error: Known type conflict
            [previousCoords, currentCoord],
            feature2.properties
          );
          if (
            // @ts-expect-error: Known type conflict
            callback(
              // @ts-expect-error: Known type conflict
              currentSegment,
              featureIndex,
              multiFeatureIndex,
              geometryIndex,
              segmentIndex
            ) === false
          )
            return false;
          segmentIndex++;
          previousCoords = currentCoord;
        }
      ) === false
    )
      return false;
  });
}

// node_modules/point-in-polygon-hao/node_modules/robust-predicates/esm/util.js
var epsilon = 11102230246251565e-32;
var splitter = 134217729;
var resulterrbound = (3 + 8 * epsilon) * epsilon;
function sum(elen, e, flen, f, h) {
  let Q, Qnew, hh, bvirt;
  let enow = e[0];
  let fnow = f[0];
  let eindex = 0;
  let findex = 0;
  if (fnow > enow === fnow > -enow) {
    Q = enow;
    enow = e[++eindex];
  } else {
    Q = fnow;
    fnow = f[++findex];
  }
  let hindex = 0;
  if (eindex < elen && findex < flen) {
    if (fnow > enow === fnow > -enow) {
      Qnew = enow + Q;
      hh = Q - (Qnew - enow);
      enow = e[++eindex];
    } else {
      Qnew = fnow + Q;
      hh = Q - (Qnew - fnow);
      fnow = f[++findex];
    }
    Q = Qnew;
    if (hh !== 0) {
      h[hindex++] = hh;
    }
    while (eindex < elen && findex < flen) {
      if (fnow > enow === fnow > -enow) {
        Qnew = Q + enow;
        bvirt = Qnew - Q;
        hh = Q - (Qnew - bvirt) + (enow - bvirt);
        enow = e[++eindex];
      } else {
        Qnew = Q + fnow;
        bvirt = Qnew - Q;
        hh = Q - (Qnew - bvirt) + (fnow - bvirt);
        fnow = f[++findex];
      }
      Q = Qnew;
      if (hh !== 0) {
        h[hindex++] = hh;
      }
    }
  }
  while (eindex < elen) {
    Qnew = Q + enow;
    bvirt = Qnew - Q;
    hh = Q - (Qnew - bvirt) + (enow - bvirt);
    enow = e[++eindex];
    Q = Qnew;
    if (hh !== 0) {
      h[hindex++] = hh;
    }
  }
  while (findex < flen) {
    Qnew = Q + fnow;
    bvirt = Qnew - Q;
    hh = Q - (Qnew - bvirt) + (fnow - bvirt);
    fnow = f[++findex];
    Q = Qnew;
    if (hh !== 0) {
      h[hindex++] = hh;
    }
  }
  if (Q !== 0 || hindex === 0) {
    h[hindex++] = Q;
  }
  return hindex;
}
function estimate(elen, e) {
  let Q = e[0];
  for (let i = 1; i < elen; i++) Q += e[i];
  return Q;
}
function vec(n) {
  return new Float64Array(n);
}

// node_modules/point-in-polygon-hao/node_modules/robust-predicates/esm/orient2d.js
var ccwerrboundA = (3 + 16 * epsilon) * epsilon;
var ccwerrboundB = (2 + 12 * epsilon) * epsilon;
var ccwerrboundC = (9 + 64 * epsilon) * epsilon * epsilon;
var B = vec(4);
var C1 = vec(8);
var C2 = vec(12);
var D = vec(16);
var u = vec(4);
function orient2dadapt(ax, ay, bx, by, cx, cy, detsum) {
  let acxtail, acytail, bcxtail, bcytail;
  let bvirt, c, ahi, alo, bhi, blo, _i, _j, _0, s1, s0, t1, t0, u32;
  const acx = ax - cx;
  const bcx = bx - cx;
  const acy = ay - cy;
  const bcy = by - cy;
  s1 = acx * bcy;
  c = splitter * acx;
  ahi = c - (c - acx);
  alo = acx - ahi;
  c = splitter * bcy;
  bhi = c - (c - bcy);
  blo = bcy - bhi;
  s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
  t1 = acy * bcx;
  c = splitter * acy;
  ahi = c - (c - acy);
  alo = acy - ahi;
  c = splitter * bcx;
  bhi = c - (c - bcx);
  blo = bcx - bhi;
  t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
  _i = s0 - t0;
  bvirt = s0 - _i;
  B[0] = s0 - (_i + bvirt) + (bvirt - t0);
  _j = s1 + _i;
  bvirt = _j - s1;
  _0 = s1 - (_j - bvirt) + (_i - bvirt);
  _i = _0 - t1;
  bvirt = _0 - _i;
  B[1] = _0 - (_i + bvirt) + (bvirt - t1);
  u32 = _j + _i;
  bvirt = u32 - _j;
  B[2] = _j - (u32 - bvirt) + (_i - bvirt);
  B[3] = u32;
  let det = estimate(4, B);
  let errbound = ccwerrboundB * detsum;
  if (det >= errbound || -det >= errbound) {
    return det;
  }
  bvirt = ax - acx;
  acxtail = ax - (acx + bvirt) + (bvirt - cx);
  bvirt = bx - bcx;
  bcxtail = bx - (bcx + bvirt) + (bvirt - cx);
  bvirt = ay - acy;
  acytail = ay - (acy + bvirt) + (bvirt - cy);
  bvirt = by - bcy;
  bcytail = by - (bcy + bvirt) + (bvirt - cy);
  if (acxtail === 0 && acytail === 0 && bcxtail === 0 && bcytail === 0) {
    return det;
  }
  errbound = ccwerrboundC * detsum + resulterrbound * Math.abs(det);
  det += acx * bcytail + bcy * acxtail - (acy * bcxtail + bcx * acytail);
  if (det >= errbound || -det >= errbound) return det;
  s1 = acxtail * bcy;
  c = splitter * acxtail;
  ahi = c - (c - acxtail);
  alo = acxtail - ahi;
  c = splitter * bcy;
  bhi = c - (c - bcy);
  blo = bcy - bhi;
  s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
  t1 = acytail * bcx;
  c = splitter * acytail;
  ahi = c - (c - acytail);
  alo = acytail - ahi;
  c = splitter * bcx;
  bhi = c - (c - bcx);
  blo = bcx - bhi;
  t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
  _i = s0 - t0;
  bvirt = s0 - _i;
  u[0] = s0 - (_i + bvirt) + (bvirt - t0);
  _j = s1 + _i;
  bvirt = _j - s1;
  _0 = s1 - (_j - bvirt) + (_i - bvirt);
  _i = _0 - t1;
  bvirt = _0 - _i;
  u[1] = _0 - (_i + bvirt) + (bvirt - t1);
  u32 = _j + _i;
  bvirt = u32 - _j;
  u[2] = _j - (u32 - bvirt) + (_i - bvirt);
  u[3] = u32;
  const C1len = sum(4, B, 4, u, C1);
  s1 = acx * bcytail;
  c = splitter * acx;
  ahi = c - (c - acx);
  alo = acx - ahi;
  c = splitter * bcytail;
  bhi = c - (c - bcytail);
  blo = bcytail - bhi;
  s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
  t1 = acy * bcxtail;
  c = splitter * acy;
  ahi = c - (c - acy);
  alo = acy - ahi;
  c = splitter * bcxtail;
  bhi = c - (c - bcxtail);
  blo = bcxtail - bhi;
  t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
  _i = s0 - t0;
  bvirt = s0 - _i;
  u[0] = s0 - (_i + bvirt) + (bvirt - t0);
  _j = s1 + _i;
  bvirt = _j - s1;
  _0 = s1 - (_j - bvirt) + (_i - bvirt);
  _i = _0 - t1;
  bvirt = _0 - _i;
  u[1] = _0 - (_i + bvirt) + (bvirt - t1);
  u32 = _j + _i;
  bvirt = u32 - _j;
  u[2] = _j - (u32 - bvirt) + (_i - bvirt);
  u[3] = u32;
  const C2len = sum(C1len, C1, 4, u, C2);
  s1 = acxtail * bcytail;
  c = splitter * acxtail;
  ahi = c - (c - acxtail);
  alo = acxtail - ahi;
  c = splitter * bcytail;
  bhi = c - (c - bcytail);
  blo = bcytail - bhi;
  s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
  t1 = acytail * bcxtail;
  c = splitter * acytail;
  ahi = c - (c - acytail);
  alo = acytail - ahi;
  c = splitter * bcxtail;
  bhi = c - (c - bcxtail);
  blo = bcxtail - bhi;
  t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
  _i = s0 - t0;
  bvirt = s0 - _i;
  u[0] = s0 - (_i + bvirt) + (bvirt - t0);
  _j = s1 + _i;
  bvirt = _j - s1;
  _0 = s1 - (_j - bvirt) + (_i - bvirt);
  _i = _0 - t1;
  bvirt = _0 - _i;
  u[1] = _0 - (_i + bvirt) + (bvirt - t1);
  u32 = _j + _i;
  bvirt = u32 - _j;
  u[2] = _j - (u32 - bvirt) + (_i - bvirt);
  u[3] = u32;
  const Dlen = sum(C2len, C2, 4, u, D);
  return D[Dlen - 1];
}
function orient2d(ax, ay, bx, by, cx, cy) {
  const detleft = (ay - cy) * (bx - cx);
  const detright = (ax - cx) * (by - cy);
  const det = detleft - detright;
  const detsum = Math.abs(detleft + detright);
  if (Math.abs(det) >= ccwerrboundA * detsum) return det;
  return -orient2dadapt(ax, ay, bx, by, cx, cy, detsum);
}

// node_modules/point-in-polygon-hao/node_modules/robust-predicates/esm/orient3d.js
var o3derrboundA = (7 + 56 * epsilon) * epsilon;
var o3derrboundB = (3 + 28 * epsilon) * epsilon;
var o3derrboundC = (26 + 288 * epsilon) * epsilon * epsilon;
var bc = vec(4);
var ca = vec(4);
var ab = vec(4);
var at_b = vec(4);
var at_c = vec(4);
var bt_c = vec(4);
var bt_a = vec(4);
var ct_a = vec(4);
var ct_b = vec(4);
var bct = vec(8);
var cat = vec(8);
var abt = vec(8);
var u2 = vec(4);
var _8 = vec(8);
var _8b = vec(8);
var _16 = vec(16);
var _12 = vec(12);
var fin = vec(192);
var fin2 = vec(192);

// node_modules/point-in-polygon-hao/node_modules/robust-predicates/esm/incircle.js
var iccerrboundA = (10 + 96 * epsilon) * epsilon;
var iccerrboundB = (4 + 48 * epsilon) * epsilon;
var iccerrboundC = (44 + 576 * epsilon) * epsilon * epsilon;
var bc2 = vec(4);
var ca2 = vec(4);
var ab2 = vec(4);
var aa = vec(4);
var bb = vec(4);
var cc = vec(4);
var u3 = vec(4);
var v = vec(4);
var axtbc = vec(8);
var aytbc = vec(8);
var bxtca = vec(8);
var bytca = vec(8);
var cxtab = vec(8);
var cytab = vec(8);
var abt2 = vec(8);
var bct2 = vec(8);
var cat2 = vec(8);
var abtt = vec(4);
var bctt = vec(4);
var catt = vec(4);
var _82 = vec(8);
var _162 = vec(16);
var _16b = vec(16);
var _16c = vec(16);
var _32 = vec(32);
var _32b = vec(32);
var _48 = vec(48);
var _64 = vec(64);
var fin3 = vec(1152);
var fin22 = vec(1152);

// node_modules/point-in-polygon-hao/node_modules/robust-predicates/esm/insphere.js
var isperrboundA = (16 + 224 * epsilon) * epsilon;
var isperrboundB = (5 + 72 * epsilon) * epsilon;
var isperrboundC = (71 + 1408 * epsilon) * epsilon * epsilon;
var ab3 = vec(4);
var bc3 = vec(4);
var cd = vec(4);
var de = vec(4);
var ea = vec(4);
var ac = vec(4);
var bd = vec(4);
var ce = vec(4);
var da = vec(4);
var eb = vec(4);
var abc = vec(24);
var bcd = vec(24);
var cde = vec(24);
var dea = vec(24);
var eab = vec(24);
var abd = vec(24);
var bce = vec(24);
var cda = vec(24);
var deb = vec(24);
var eac = vec(24);
var adet = vec(1152);
var bdet = vec(1152);
var cdet = vec(1152);
var ddet = vec(1152);
var edet = vec(1152);
var abdet = vec(2304);
var cddet = vec(2304);
var cdedet = vec(3456);
var deter = vec(5760);
var _83 = vec(8);
var _8b2 = vec(8);
var _8c = vec(8);
var _163 = vec(16);
var _24 = vec(24);
var _482 = vec(48);
var _48b = vec(48);
var _96 = vec(96);
var _192 = vec(192);
var _384x = vec(384);
var _384y = vec(384);
var _384z = vec(384);
var _768 = vec(768);
var xdet = vec(96);
var ydet = vec(96);
var zdet = vec(96);
var fin4 = vec(1152);

// node_modules/point-in-polygon-hao/dist/esm/index.js
function pointInPolygon(p, polygon2) {
  var i;
  var ii;
  var k = 0;
  var f;
  var u1;
  var v1;
  var u22;
  var v2;
  var currentP;
  var nextP;
  var x = p[0];
  var y = p[1];
  var numContours = polygon2.length;
  for (i = 0; i < numContours; i++) {
    ii = 0;
    var contour = polygon2[i];
    var contourLen = contour.length - 1;
    currentP = contour[0];
    if (currentP[0] !== contour[contourLen][0] && currentP[1] !== contour[contourLen][1]) {
      throw new Error("First and last coordinates in a ring must be the same");
    }
    u1 = currentP[0] - x;
    v1 = currentP[1] - y;
    for (ii; ii < contourLen; ii++) {
      nextP = contour[ii + 1];
      u22 = nextP[0] - x;
      v2 = nextP[1] - y;
      if (v1 === 0 && v2 === 0) {
        if (u22 <= 0 && u1 >= 0 || u1 <= 0 && u22 >= 0) {
          return 0;
        }
      } else if (v2 >= 0 && v1 <= 0 || v2 <= 0 && v1 >= 0) {
        f = orient2d(u1, u22, v1, v2, 0, 0);
        if (f === 0) {
          return 0;
        }
        if (f > 0 && v2 > 0 && v1 <= 0 || f < 0 && v2 <= 0 && v1 > 0) {
          k++;
        }
      }
      currentP = nextP;
      v1 = v2;
      u1 = u22;
    }
  }
  if (k % 2 === 0) {
    return false;
  }
  return true;
}

// node_modules/@turf/boolean-point-in-polygon/dist/esm/index.js
function booleanPointInPolygon(point2, polygon2, options = {}) {
  if (!point2) {
    throw new Error("point is required");
  }
  if (!polygon2) {
    throw new Error("polygon is required");
  }
  const pt = getCoord(point2);
  const geom = getGeom(polygon2);
  const type = geom.type;
  const bbox = polygon2.bbox;
  let polys = geom.coordinates;
  if (bbox && inBBox(pt, bbox) === false) {
    return false;
  }
  if (type === "Polygon") {
    polys = [polys];
  }
  for (var i = 0; i < polys.length; ++i) {
    const polyResult = pointInPolygon(pt, polys[i]);
    if (polyResult === 0 && !options.ignoreBoundary) return true;
    else if (polyResult) return true;
  }
  return false;
}
function inBBox(pt, bbox) {
  return bbox[0] <= pt[0] && bbox[1] <= pt[1] && bbox[2] >= pt[0] && bbox[3] >= pt[1];
}

// node_modules/@turf/nearest-point-on-line/dist/esm/index.js
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
function nearestPointOnLine(lines, inputPoint, options = {}) {
  if (!lines || !inputPoint) {
    throw new Error("lines and inputPoint are required arguments");
  }
  const inputPos = getCoord(inputPoint);
  let closestPt = point([Infinity, Infinity], {
    lineStringIndex: -1,
    segmentIndex: -1,
    totalDistance: -1,
    lineDistance: -1,
    segmentDistance: -1,
    pointDistance: Infinity,
    // deprecated properties START
    multiFeatureIndex: -1,
    index: -1,
    location: -1,
    dist: Infinity
    // deprecated properties END
  });
  let totalDistance = 0;
  let lineDistance = 0;
  let currentLineStringIndex = -1;
  flattenEach(
    lines,
    function(line, _featureIndex, lineStringIndex) {
      if (currentLineStringIndex !== lineStringIndex) {
        currentLineStringIndex = lineStringIndex;
        lineDistance = 0;
      }
      const coords = getCoords(line);
      for (let i = 0; i < coords.length - 1; i++) {
        const start = point(coords[i]);
        const startPos = getCoord(start);
        const stop = point(coords[i + 1]);
        const stopPos = getCoord(stop);
        const segmentLength = distance(start, stop, options);
        let intersectPos;
        let wasEnd;
        if (stopPos[0] === inputPos[0] && stopPos[1] === inputPos[1]) {
          [intersectPos, wasEnd] = [stopPos, true];
        } else if (startPos[0] === inputPos[0] && startPos[1] === inputPos[1]) {
          [intersectPos, wasEnd] = [startPos, false];
        } else {
          [intersectPos, wasEnd] = nearestPointOnSegment(
            startPos,
            stopPos,
            inputPos
          );
        }
        const pointDistance = distance(inputPoint, intersectPos, options);
        if (pointDistance < closestPt.properties.pointDistance) {
          const segmentDistance = distance(start, intersectPos, options);
          closestPt = point(intersectPos, {
            lineStringIndex,
            // Legacy behaviour where index progresses to next segment # if we
            // went with the end point this iteration.
            segmentIndex: wasEnd ? i + 1 : i,
            totalDistance: totalDistance + segmentDistance,
            lineDistance: lineDistance + segmentDistance,
            segmentDistance,
            pointDistance,
            // deprecated properties START
            multiFeatureIndex: -1,
            index: -1,
            location: -1,
            dist: Infinity
            // deprecated properties END
          });
          closestPt.properties = __spreadProps(__spreadValues({}, closestPt.properties), {
            multiFeatureIndex: closestPt.properties.lineStringIndex,
            index: closestPt.properties.segmentIndex,
            location: closestPt.properties.totalDistance,
            dist: closestPt.properties.pointDistance
            // deprecated properties END
          });
        }
        totalDistance += segmentLength;
        lineDistance += segmentLength;
      }
    }
  );
  return closestPt;
}
function dot(v1, v2) {
  const [v1x, v1y, v1z] = v1;
  const [v2x, v2y, v2z] = v2;
  return v1x * v2x + v1y * v2y + v1z * v2z;
}
function cross(v1, v2) {
  const [v1x, v1y, v1z] = v1;
  const [v2x, v2y, v2z] = v2;
  return [v1y * v2z - v1z * v2y, v1z * v2x - v1x * v2z, v1x * v2y - v1y * v2x];
}
function magnitude(v2) {
  return Math.sqrt(Math.pow(v2[0], 2) + Math.pow(v2[1], 2) + Math.pow(v2[2], 2));
}
function normalize(v2) {
  const mag = magnitude(v2);
  return [v2[0] / mag, v2[1] / mag, v2[2] / mag];
}
function lngLatToVector(a) {
  const lat = degreesToRadians(a[1]);
  const lng = degreesToRadians(a[0]);
  return [
    Math.cos(lat) * Math.cos(lng),
    Math.cos(lat) * Math.sin(lng),
    Math.sin(lat)
  ];
}
function vectorToLngLat(v2) {
  const [x, y, z] = v2;
  const zClamp = Math.min(Math.max(z, -1), 1);
  const lat = radiansToDegrees(Math.asin(zClamp));
  const lng = radiansToDegrees(Math.atan2(y, x));
  return [lng, lat];
}
function nearestPointOnSegment(posA, posB, posC) {
  const A = lngLatToVector(posA);
  const B2 = lngLatToVector(posB);
  const C = lngLatToVector(posC);
  const segmentAxis = cross(A, B2);
  if (segmentAxis[0] === 0 && segmentAxis[1] === 0 && segmentAxis[2] === 0) {
    if (dot(A, B2) > 0) {
      return [[...posB], true];
    } else {
      return [[...posC], false];
    }
  }
  const targetAxis = cross(segmentAxis, C);
  if (targetAxis[0] === 0 && targetAxis[1] === 0 && targetAxis[2] === 0) {
    return [[...posB], true];
  }
  const intersectionAxis = cross(targetAxis, segmentAxis);
  const I1 = normalize(intersectionAxis);
  const I2 = [-I1[0], -I1[1], -I1[2]];
  const I = dot(C, I1) > dot(C, I2) ? I1 : I2;
  const segmentAxisNorm = normalize(segmentAxis);
  const cmpAI = dot(cross(A, I), segmentAxisNorm);
  const cmpIB = dot(cross(I, B2), segmentAxisNorm);
  if (cmpAI >= 0 && cmpIB >= 0) {
    return [vectorToLngLat(I), false];
  }
  if (dot(A, C) > dot(B2, C)) {
    return [[...posA], false];
  } else {
    return [[...posB], true];
  }
}

// node_modules/@turf/polygon-to-line/dist/esm/index.js
function polygonToLine(poly, options = {}) {
  const geom = getGeom(poly);
  if (!options.properties && poly.type === "Feature") {
    options.properties = poly.properties;
  }
  switch (geom.type) {
    case "Polygon":
      return singlePolygonToLine(geom, options);
    case "MultiPolygon":
      return multiPolygonToLine(geom, options);
    default:
      throw new Error("invalid poly");
  }
}
function singlePolygonToLine(poly, options = {}) {
  const geom = getGeom(poly);
  const coords = geom.coordinates;
  const properties = options.properties ? options.properties : poly.type === "Feature" ? poly.properties : {};
  return coordsToLine(coords, properties);
}
function multiPolygonToLine(multiPoly, options = {}) {
  const geom = getGeom(multiPoly);
  const coords = geom.coordinates;
  const properties = options.properties ? options.properties : multiPoly.type === "Feature" ? multiPoly.properties : {};
  const lines = [];
  coords.forEach((coord) => {
    lines.push(coordsToLine(coord, properties));
  });
  return featureCollection(lines);
}
function coordsToLine(coords, properties) {
  if (coords.length > 1) {
    return multiLineString(coords, properties);
  }
  return lineString(coords[0], properties);
}

// node_modules/@turf/rhumb-distance/dist/esm/index.js
function rhumbDistance(from, to, options = {}) {
  const origin = getCoord(from);
  const destination = getCoord(to);
  destination[0] += destination[0] - origin[0] > 180 ? -360 : origin[0] - destination[0] > 180 ? 360 : 0;
  const distanceInMeters = calculateRhumbDistance(origin, destination);
  const distance2 = convertLength(distanceInMeters, "meters", options.units);
  return distance2;
}
function calculateRhumbDistance(origin, destination, radius) {
  radius = radius === void 0 ? earthRadius : Number(radius);
  const R = radius;
  const phi1 = origin[1] * Math.PI / 180;
  const phi2 = destination[1] * Math.PI / 180;
  const DeltaPhi = phi2 - phi1;
  let DeltaLambda = Math.abs(destination[0] - origin[0]) * Math.PI / 180;
  if (DeltaLambda > Math.PI) {
    DeltaLambda -= 2 * Math.PI;
  }
  const DeltaPsi = Math.log(
    Math.tan(phi2 / 2 + Math.PI / 4) / Math.tan(phi1 / 2 + Math.PI / 4)
  );
  const q = Math.abs(DeltaPsi) > 1e-11 ? DeltaPhi / DeltaPsi : Math.cos(phi1);
  const delta = Math.sqrt(
    DeltaPhi * DeltaPhi + q * q * DeltaLambda * DeltaLambda
  );
  const dist = delta * R;
  return dist;
}

// node_modules/@turf/point-to-line-distance/dist/esm/index.js
function pointToLineDistance(pt, line, options = {}) {
  var _a, _b;
  const method = (_a = options.method) != null ? _a : "geodesic";
  const units = (_b = options.units) != null ? _b : "kilometers";
  if (!pt) {
    throw new Error("pt is required");
  }
  if (Array.isArray(pt)) {
    pt = point(pt);
  } else if (pt.type === "Point") {
    pt = feature(pt);
  } else {
    featureOf(pt, "Point", "point");
  }
  if (!line) {
    throw new Error("line is required");
  }
  if (Array.isArray(line)) {
    line = lineString(line);
  } else if (line.type === "LineString") {
    line = feature(line);
  } else {
    featureOf(line, "LineString", "line");
  }
  let distance2 = Infinity;
  const p = pt.geometry.coordinates;
  segmentEach(line, (segment) => {
    if (segment) {
      const a = segment.geometry.coordinates[0];
      const b = segment.geometry.coordinates[1];
      const d = distanceToSegment(p, a, b, { method });
      if (d < distance2) {
        distance2 = d;
      }
    }
  });
  return convertLength(distance2, "degrees", units);
}
function distanceToSegment(p, a, b, options) {
  if (options.method === "geodesic") {
    const nearest = nearestPointOnLine(lineString([a, b]).geometry, p, {
      units: "degrees"
    });
    return nearest.properties.pointDistance;
  }
  const v2 = [b[0] - a[0], b[1] - a[1]];
  const w = [p[0] - a[0], p[1] - a[1]];
  const c1 = dot2(w, v2);
  if (c1 <= 0) {
    return rhumbDistance(p, a, { units: "degrees" });
  }
  const c2 = dot2(v2, v2);
  if (c2 <= c1) {
    return rhumbDistance(p, b, { units: "degrees" });
  }
  const b2 = c1 / c2;
  const Pb = [a[0] + b2 * v2[0], a[1] + b2 * v2[1]];
  return rhumbDistance(p, Pb, { units: "degrees" });
}
function dot2(u4, v2) {
  return u4[0] * v2[0] + u4[1] * v2[1];
}

// node_modules/@turf/point-to-polygon-distance/dist/esm/index.js
function pointToPolygonDistance(point2, polygonOrMultiPolygon, options = {}) {
  var _a, _b;
  const method = (_a = options.method) != null ? _a : "geodesic";
  const units = (_b = options.units) != null ? _b : "kilometers";
  if (!point2) throw new Error("point is required");
  if (!polygonOrMultiPolygon)
    throw new Error("polygon or multi-polygon is required");
  const geom = getGeom(polygonOrMultiPolygon);
  if (geom.type === "MultiPolygon") {
    const distances = geom.coordinates.map(
      (coords) => pointToPolygonDistance(point2, polygon(coords), { method, units })
    );
    return Math.min(...distances.map(Math.abs)) * (booleanPointInPolygon(point2, polygonOrMultiPolygon) ? -1 : 1);
  }
  if (geom.coordinates.length > 1) {
    const [exteriorDistance, ...interiorDistances] = geom.coordinates.map(
      (coords) => pointToPolygonDistance(point2, polygon([coords]), { method, units })
    );
    if (exteriorDistance >= 0) return exteriorDistance;
    const smallestInteriorDistance = Math.min(...interiorDistances);
    if (smallestInteriorDistance < 0) return Math.abs(smallestInteriorDistance);
    return Math.max(smallestInteriorDistance * -1, exteriorDistance);
  }
  const lines = polygonToLine(geom);
  let minDistance = Infinity;
  flattenEach(lines, (feature2) => {
    minDistance = Math.min(
      minDistance,
      pointToLineDistance(point2, feature2, {
        method,
        units
      })
    );
  });
  return booleanPointInPolygon(point2, geom) ? -minDistance : minDistance;
}

// src/shared/geo.ts
var inBBox2 = (b, lat, lon) => lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];
function regionAt(regions, lat, lon) {
  return regions.find((r) => inBBox2(r.bbox, lat, lon)) ?? null;
}
function floodDistanceKm(fc, lat, lon, maxKm = 200) {
  if (!fc || !fc.features.length) return null;
  const p = point([lon, lat]);
  let best = Infinity;
  for (const f of fc.features) {
    if (booleanPointInPolygon(p, f)) return 0;
    const d = pointToPolygonDistance(p, f, { units: "kilometers" });
    if (d < best) best = d;
  }
  return best <= maxKm ? Math.max(best, 0.01) : null;
}
function nearestFloodKm(regions, lat, lon) {
  let best = null;
  for (const r of regions) {
    const pad = 3;
    if (lon < r.bbox[0] - pad || lon > r.bbox[2] + pad || lat < r.bbox[1] - pad || lat > r.bbox[3] + pad) continue;
    const d = floodDistanceKm(r.flood, lat, lon);
    if (d != null && (best == null || d < best)) best = d;
  }
  return best;
}

// src/shared/tier.ts
var TIER_META = {
  GREEN: { code: 0, title: "No current concern", color: "#2f7d4f" },
  YELLOW: { code: 1, title: "Flood watch", color: "#f2c230" },
  ORANGE: { code: 2, title: "Flood warning", color: "#e8741e" },
  RED: { code: 3, title: "Flood imminent or occurring", color: "#c62f2f" },
  BLUE: { code: -1, title: "Global report", color: "#2b6cb0" }
};
function findCell(ground, lat, lon) {
  if (!ground) return null;
  return ground.cells.find((c) => lon >= c.bbox[0] && lon < c.bbox[2] && lat >= c.bbox[1] && lat < c.bbox[3]) ?? null;
}
function sum48h(hourlyMm) {
  return Math.round(hourlyMm.slice(0, 48).reduce((a, b) => a + (b || 0), 0) * 10) / 10;
}
var ordinal = (n) => {
  const t = n % 100;
  return `${n}${t >= 11 && t <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};
function computeSignals(inp) {
  const { config: c } = inp;
  const cell = findCell(inp.ground, inp.lat, inp.lon);
  const satAsOf = inp.ground?.as_of ?? null;
  const wet = {
    id: "wetness",
    label: "Soil wetness",
    high: false,
    status: "no_data",
    value: "No NISAR analysis here",
    source: inp.ground?.wetness_source ?? "NISAR",
    asOf: satAsOf,
    simulated: false
  };
  if (cell && cell.wetness != null) {
    wet.status = "ok";
    wet.high = cell.wetness >= c.wetness_percentile_high;
    wet.value = `${ordinal(Math.round(cell.wetness * 100))} percentile (high at \u2265 ${ordinal(Math.round(c.wetness_percentile_high * 100))})`;
  }
  const water = {
    id: "water",
    label: "Water above normal",
    high: false,
    status: "no_data",
    value: "No NISAR analysis here",
    source: inp.ground?.water_source ?? "NISAR vs JRC",
    asOf: satAsOf,
    simulated: false
  };
  if (cell && cell.water_ratio != null) {
    water.status = "ok";
    water.high = cell.water_ratio >= c.water_ratio_high;
    const r = cell.water_ratio;
    water.value = (r >= 99 ? "Over 99\xD7 normal extent" : r < 1 ? "At or below normal extent" : `${r.toFixed(1)}\xD7 normal extent`) + ` (high at \u2265 ${c.water_ratio_high}\xD7)`;
  }
  const rainMm = inp.sim.storm ? c.sim.rain_48h_mm : inp.rain48mm;
  const rain = {
    id: "rain",
    label: "Rain forecast, next 48 h",
    high: false,
    status: rainMm == null ? "no_data" : "ok",
    value: rainMm == null ? "Forecast unavailable" : `${rainMm} mm (high at \u2265 ${c.rain_48h_mm_high} mm)`,
    source: inp.sim.storm ? "Simulated storm" : "Open-Meteo",
    asOf: inp.sim.storm ? new Date(inp.nowMs).toISOString() : inp.rainAsOf,
    simulated: inp.sim.storm
  };
  if (rainMm != null) rain.high = rainMm >= c.rain_48h_mm_high;
  const sensor = {
    id: "sensor",
    label: "Ground sensor rising",
    high: false,
    status: "offline",
    value: "Sensor offline",
    source: "ESP32 water-level sensor",
    asOf: null,
    simulated: false
  };
  if (inp.sim.sensor_rise) {
    sensor.status = "ok";
    sensor.high = true;
    sensor.simulated = true;
    sensor.value = `Rising fast (simulated)`;
    sensor.source = "Simulated sensor";
    sensor.asOf = new Date(inp.nowMs).toISOString();
  } else if (inp.sensor) {
    const age = inp.nowMs / 1e3 - inp.sensor.ts;
    sensor.asOf = new Date(inp.sensor.ts * 1e3).toISOString();
    if (age <= c.sensor_stale_s) {
      sensor.status = "ok";
      sensor.high = inp.sensor.rate >= c.sensor_rise_high;
      sensor.value = `Level ${Math.round(inp.sensor.level)}, ${inp.sensor.rate >= 0 ? "+" : ""}${Math.round(inp.sensor.rate)}/min (high at \u2265 +${c.sensor_rise_high}/min)`;
    } else {
      sensor.value = `Sensor offline (last heard ${Math.round(age)} s ago)`;
    }
  }
  const d = inp.floodDistanceKm;
  const nearby = {
    id: "nearby",
    label: `Mapped flooding within ${c.near_km} km`,
    high: d != null && d <= c.near_km,
    status: d == null ? "no_data" : "ok",
    value: d == null ? "No mapped flooding in range" : d === 0 ? "Location is inside a mapped flood area" : `Nearest mapped flooding ${d.toFixed(1)} km away`,
    source: "NISAR flood polygons",
    asOf: satAsOf,
    simulated: false
  };
  return [wet, water, rain, sensor, nearby];
}
function computeTier(inp) {
  const signals = computeSignals(inp);
  const by = Object.fromEntries(signals.map((s) => [s.id, s]));
  const n = signals.filter((s) => s.high).length;
  const d = inp.floodDistanceKm;
  const inside = d === 0;
  const ground = by.wetness.high || by.water.high;
  let tier = "GREEN";
  let reason = n === 1 ? "One warning sign only; at least two must agree." : "No warning signs detected in your area.";
  if (inside) {
    tier = "RED";
    reason = "Satellite data shows flooding at this location.";
  } else if (n >= 3) {
    tier = "RED";
    reason = `${n} independent warning signs agree.`;
  } else if (d != null && d <= inp.config.far_km) {
    tier = "ORANGE";
    reason = `Flooding detected ${d.toFixed(1)} km away.`;
  } else if (n === 2 && ground && by.rain.high && !(by.wetness.high && by.water.high)) {
    tier = "YELLOW";
    reason = "Ground conditions are wet and significant rain is expected.";
  } else if (n === 2) {
    tier = "ORANGE";
    reason = "Two warning signs agree.";
  }
  const meta = TIER_META[tier];
  return {
    tier,
    code: meta.code,
    title: meta.title,
    reason,
    signals,
    signalsHigh: n,
    insideFlood: inside,
    floodDistanceKm: d,
    simulated: signals.some((s) => s.simulated && s.high)
  };
}
function lcdLine(r) {
  let s;
  if (r.insideFlood) s = "Flood at site";
  else if (r.tier === "RED") s = `${r.signalsHigh} signs agree`;
  else if (r.floodDistanceKm != null && r.tier === "ORANGE") s = `Flood ${Math.round(r.floodDistanceKm)}km away`;
  else if (r.tier === "ORANGE") s = "2 signs agree";
  else if (r.tier === "YELLOW") s = "Wet + rain due";
  else s = "All clear";
  return s.slice(0, 16);
}

// server/tier.ts
var cache = null;
var getJson = async (url, ms = 4e3) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return await r.json();
};
async function loadStatic(origin) {
  if (cache && cache.origin === origin && Date.now() - cache.at < 6e4) return cache.data;
  const f = (n) => getJson(`${origin}/data/${n}`);
  const [config, index] = await Promise.all([
    f("config.json"),
    f("regions.json")
  ]);
  const regions = await Promise.all(index.map(async (r) => {
    const [ground, flood, forecast, meta] = await Promise.all([
      f(`${r.id}/signals.json`),
      f(`${r.id}/flood.geojson`),
      f(`${r.id}/forecast.json`),
      f(`${r.id}/meta.json`)
    ]);
    return { ...r, ground, flood, forecast, meta };
  }));
  cache = { at: Date.now(), origin, data: { config, regions } };
  return cache.data;
}
async function buildTier(origin, query) {
  const s = await loadStatic(origin);
  const lat = Number(query.get("lat") ?? s.config.device_location.lat);
  const lon = Number(query.get("lon") ?? s.config.device_location.lon);
  const here = regionAt(s.regions, lat, lon);
  const fb = (s.config.firebase_url ?? "").replace(/\/$/, "");
  const [sensor, demo, rain] = await Promise.all([
    fb ? getJson(`${fb}/sensor/latest.json`, 2500).catch(() => null) : null,
    fb ? getJson(`${fb}/demo.json`, 2500).catch(() => null) : null,
    getJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&hourly=precipitation&forecast_days=3&timezone=UTC`,
      3e3
    ).then((d) => ({ mm: sum48h(d.hourly.precipitation), asOf: (/* @__PURE__ */ new Date()).toISOString() })).catch(() => here ? { mm: here.forecast.rain_48h_mm, asOf: here.forecast.fetched } : { mm: null, asOf: null })
  ]);
  const now = Date.now();
  const r = computeTier({
    config: s.config,
    lat,
    lon,
    ground: here?.ground ?? null,
    rain48mm: rain.mm,
    rainAsOf: rain.asOf,
    sensor: sensor && typeof sensor.ts === "number" ? sensor : null,
    floodDistanceKm: nearestFloodKm(s.regions, lat, lon),
    sim: { storm: !!demo?.storm, sensor_rise: !!demo?.sensor_rise },
    nowMs: now
  });
  return {
    tier: r.tier,
    code: r.code,
    title: r.title,
    line: lcdLine(r),
    signals_high: r.signalsHigh,
    sat_age_d: here ? Math.round((now - Date.parse(here.meta.post.acquired)) / 864e5) : -1,
    region: here?.id ?? null,
    sensor: r.signals[3].simulated ? "sim" : r.signals[3].status === "ok" ? "ok" : "offline",
    simulated: r.simulated,
    fixture: s.regions.some((x) => x.meta.fixture),
    ts: Math.floor(now / 1e3)
  };
}
async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  try {
    const proto = req.headers["x-forwarded-proto"] ?? "https";
    const url = new URL(req.url ?? "/", `${proto}://${req.headers.host}`);
    res.statusCode = 200;
    res.end(JSON.stringify(await buildTier(url.origin, url.searchParams)));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: String(e) }));
  }
}
export {
  buildTier,
  handler as default
};
