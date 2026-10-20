import { expect, test } from "@playwright/test"

import { MEETING_TYPE_SLUG, MEETING_TYPE_TITLE } from "./constants"

test("гость выбирает слот, бронирует встречу и видит статус ожидания", async ({
  page,
}) => {
  await page.goto(`/book/${MEETING_TYPE_SLUG}`)

  await expect(
    page.getByRole("heading", { level: 1, name: MEETING_TYPE_TITLE })
  ).toBeVisible()
  await expect(page.getByText("Ближайшие 14 дней")).toBeVisible()

  const firstSlot = page.locator('[id^="slots-"] button').first()
  await expect(firstSlot).toBeVisible()
  await firstSlot.click()

  await expect(
    page.getByText("Данные гостя", { exact: true })
  ).toBeVisible()

  await page.getByLabel("Имя").fill("Тестовый Гость")
  await page.getByLabel("Email").fill("guest@example.com")
  await page.getByRole("button", { name: "Забронировать" }).click()

  await expect(
    page.getByRole("heading", { name: "Бронирование создано" })
  ).toBeVisible()

  const bookingLink = page.getByRole("link", {
    name: "Открыть страницу бронирования",
  })
  await expect(bookingLink).toHaveAttribute("href", /^\/booking\/[\w-]+$/)

  await bookingLink.click()

  await expect(page).toHaveURL(/\/booking\/[\w-]+$/)
  await expect(
    page.getByRole("heading", { level: 1, name: MEETING_TYPE_TITLE })
  ).toBeVisible()
  await expect(page.getByText("Ожидает подтверждения")).toBeVisible()
})
