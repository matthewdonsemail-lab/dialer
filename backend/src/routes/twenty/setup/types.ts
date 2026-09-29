export interface SetupStatusObject {
  name: string;
  exists: boolean;
  id: string;
}

export interface SetupStatusField {
  object: string;
  name: string;
  exists: boolean;
}

export interface SetupStatusResponse {
  success: boolean;
  objects: SetupStatusObject[];
  fields: SetupStatusField[];
}
