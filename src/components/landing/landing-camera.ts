import { MathUtils, Vector3 } from "three";
import { equipmentEnvelope } from "../equipment-3d/plant-routing";
import type { EquipmentInstance } from "../equipment-3d/system-geometry";

/** Frame the complete assembly inside the space between navigation and caption. */
export function equipmentView(
  equipment: EquipmentInstance,
  width: number,
  height: number,
  fov: number,
) {
  const bounds = equipmentEnvelope(equipment);
  const target = new Vector3()
    .fromArray(bounds.min)
    .add(new Vector3().fromArray(bounds.max))
    .multiplyScalar(0.5);
  // The models' inspection openings face +X/+Z. Approach from that side.
  const direction = new Vector3(0.8, 0.32, 1).normalize();
  const right = new Vector3(0, 1, 0).cross(direction).normalize();
  const up = direction.clone().cross(right).normalize();
  const vertical = Math.tan(MathUtils.degToRad(fov) / 2);
  const horizontal = vertical * (width / height);
  const phone = width <= 700;
  const safeHeight = phone
    ? Math.max(0.3, (height - 300) / height)
    : Math.max(0.45, (height - 210) / height);
  let distance = 0;
  for (const x of [bounds.min[0], bounds.max[0]])
    for (const y of [bounds.min[1], bounds.max[1]])
      for (const z of [bounds.min[2], bounds.max[2]]) {
        const offset = new Vector3(x, y, z).sub(target);
        distance = Math.max(
          distance,
          offset.dot(direction) +
            Math.abs(offset.dot(right)) / (horizontal * 0.78),
          offset.dot(direction) +
            Math.abs(offset.dot(up)) / (vertical * safeHeight),
        );
      }
  // Put the equipment slightly above center, leaving clear space for its label.
  target.addScaledVector(up, -distance * vertical * (phone ? 0.02 : 0.04));
  return {
    target,
    position: target.clone().addScaledVector(direction, distance * 1.06),
  };
}
