const mapParametersHook = "#include <map_pars_fragment>";
const normalMapsHook = "#include <normal_fragment_maps>";

const stripeFoilParameters = `${mapParametersHook}
uniform sampler2D stripeFoilMap;
uniform float stripeFoilOpacity;
uniform float stripeFoilDetail;`;

const stripeFoilBlend = `${normalMapsHook}
#ifdef USE_MAP
  float stripeFoilCoverage = clamp(
    texture2D(stripeFoilMap, vMapUv).r * stripeFoilOpacity,
    0.0,
    1.0
  );
  vec2 stripeFoilIndex = vec2(
    sin(-normal.y * stripeFoilDetail + vViewPosition.y * stripeFoilDetail / 10.0),
    cos(-normal.x * stripeFoilDetail + vViewPosition.x * stripeFoilDetail / 10.0)
  ) / 2.0;
  const vec2 stripeFoilUvSize = vec2(0.14, -0.19);
  stripeFoilIndex =
    vec2(0.0, 1.0) +
    stripeFoilUvSize / 2.0 +
    stripeFoilIndex * stripeFoilUvSize;
  vec3 stripeFoilColor = texture2D(map, stripeFoilIndex).rgb;
  diffuseColor.rgb = mix(
    diffuseColor.rgb,
    stripeFoilColor,
    stripeFoilCoverage
  );
#endif`;

/**
 * Restores the edition shader's colored-foil pass inside Three.js'
 * MeshPhysicalMaterial. A foil atlas is a coverage mask; using it only as a
 * metalness map makes dark-on-dark titles disappear unless they catch a
 * specular highlight.
 */
export function addStripeFoilBlend(fragmentShader: string) {
  if (
    !fragmentShader.includes(mapParametersHook) ||
    !fragmentShader.includes(normalMapsHook)
  ) {
    throw new Error("MeshPhysicalMaterial shader hooks are unavailable");
  }

  return fragmentShader
    .replace(mapParametersHook, stripeFoilParameters)
    .replace(normalMapsHook, stripeFoilBlend);
}

export function stripeFoilSettings(
  material: Record<string, number | string | number[]>,
) {
  const rawOpacity = material.foilOpacity;
  const rawDetail = material.foilDetail;
  const opacity =
    typeof rawOpacity === "number" && Number.isFinite(rawOpacity)
      ? Math.min(1.5, Math.max(0, rawOpacity))
      : 0;
  const detail =
    typeof rawDetail === "number" && Number.isFinite(rawDetail)
      ? Math.max(0.1, rawDetail)
      : 1;

  return {
    enabled: opacity > 0,
    opacity,
    detail,
  };
}
