import type { TwentyObject, FieldOptions } from "../types.js";

/** Find a metadata object by singular or plural name. Pure. */
export function findTargetObject(allObjects: TwentyObject[], objectName: string): TwentyObject | undefined {
  return allObjects.find(obj =>
    obj.nameSingular === objectName || obj.namePlural === objectName
  );
}

/** Flatten SELECT field options into a field-name map. Pure. */
export function extractFieldOptions(targetObject: TwentyObject): FieldOptions {
  const fieldOptions: FieldOptions = {};
  for (const field of targetObject.fields) {
    if (field.options && field.options.length > 0) {
      fieldOptions[field.name] = field.options;
    }
  }
  return fieldOptions;
}
