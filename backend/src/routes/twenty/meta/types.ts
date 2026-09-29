export interface ObjectField {
  id: string;
  name: string;
  label: string;
  type: string;
  options?: Array<{ label: string; value: string; color: string }>;
}

export interface TwentyObject {
  id: string;
  nameSingular: string;
  namePlural: string;
  fields: ObjectField[];
}

export interface FieldOptions {
  [fieldName: string]: Array<{ label: string; value: string; color: string }>;
}
