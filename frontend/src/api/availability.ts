import type {
  Availability,
  AvailabilityListResponse,
  AvailabilityWrite,
} from "./client"
import {
  hostAvailabilitiesCreate,
  hostAvailabilitiesGet,
  hostAvailabilitiesList,
  hostAvailabilitiesRemove,
  hostAvailabilitiesReplace,
} from "./client"
import { ApiRequestError, unwrap } from "./request"

export async function listAvailabilities(): Promise<AvailabilityListResponse> {
  const { data, error, response } = await hostAvailabilitiesList()
  return unwrap(data, error, response)
}

export async function getAvailability(id: string): Promise<Availability> {
  const { data, error, response } = await hostAvailabilitiesGet({
    path: { id },
  })
  return unwrap(data, error, response)
}

export async function createAvailability(
  payload: AvailabilityWrite
): Promise<Availability> {
  const { data, error, response } = await hostAvailabilitiesCreate({
    body: payload,
  })
  return unwrap(data, error, response)
}

export async function replaceAvailability(
  id: string,
  payload: AvailabilityWrite
): Promise<Availability> {
  const { data, error, response } = await hostAvailabilitiesReplace({
    path: { id },
    body: payload,
  })
  return unwrap(data, error, response)
}

export async function removeAvailability(id: string): Promise<void> {
  const { error, response } = await hostAvailabilitiesRemove({
    path: { id },
  })

  if (error) {
    throw new ApiRequestError(error, response?.status ?? 0)
  }
}
