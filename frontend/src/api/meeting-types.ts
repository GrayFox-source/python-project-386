import type {
  MeetingType,
  MeetingTypeListResponse,
  MeetingTypeWrite,
} from "./client"
import {
  hostMeetingTypesArchive,
  hostMeetingTypesCreate,
  hostMeetingTypesGet,
  hostMeetingTypesList,
  hostMeetingTypesRemove,
  hostMeetingTypesReplace,
  hostMeetingTypesUnarchive,
} from "./client"
import { ApiRequestError, unwrap } from "./request"

export async function listMeetingTypes(): Promise<MeetingTypeListResponse> {
  const { data, error, response } = await hostMeetingTypesList({
    query: { limit: 200 },
  })
  return unwrap(data, error, response)
}

export async function getMeetingType(id: string): Promise<MeetingType> {
  const { data, error, response } = await hostMeetingTypesGet({
    path: { id },
  })
  return unwrap(data, error, response)
}

export async function createMeetingType(
  payload: MeetingTypeWrite
): Promise<MeetingType> {
  const { data, error, response } = await hostMeetingTypesCreate({
    body: payload,
  })
  return unwrap(data, error, response)
}

export async function replaceMeetingType(
  id: string,
  payload: MeetingTypeWrite
): Promise<MeetingType> {
  const { data, error, response } = await hostMeetingTypesReplace({
    path: { id },
    body: payload,
  })
  return unwrap(data, error, response)
}

export async function removeMeetingType(id: string): Promise<void> {
  const { error, response } = await hostMeetingTypesRemove({
    path: { id },
  })
  if (error) {
    throw new ApiRequestError(error, response?.status ?? 0)
  }
}

export async function archiveMeetingType(id: string): Promise<MeetingType> {
  const { data, error, response } = await hostMeetingTypesArchive({
    path: { id },
  })
  return unwrap(data, error, response)
}

export async function unarchiveMeetingType(id: string): Promise<MeetingType> {
  const { data, error, response } = await hostMeetingTypesUnarchive({
    path: { id },
  })
  return unwrap(data, error, response)
}
