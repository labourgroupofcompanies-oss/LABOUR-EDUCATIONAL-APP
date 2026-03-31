import { test, expect } from '@playwright/test';

/**
 * Staff Registration & Multi-Context Login Flow
 * This test simulates:
 * 1. Headteacher registers a new staff member.
 * 2. New staff member logs in from a completely different browser context (simulating another device).
 */
test('Staff registration and login from second context', async ({ browser }) => {
    // --- CONTEXT 1: HEADTEACHER (Registration) ---
    const headteacherContext = await browser.newContext();
    const headteacherPage = await headteacherContext.newPage();

    // Login as Headteacher (Using environment variables if available, else placeholders)
    await headteacherPage.goto('http://localhost:5173/'); // Adjust port if necessary

    // Assume login form is visible
    await headteacherPage.fill('input[placeholder*="Username"]', 'headteacher_test');
    await headteacherPage.fill('input[placeholder*="Password"]', 'password123');
    await headteacherPage.click('button:has-text("Login")');

    // Wait for dashboard
    await expect(headteacherPage).toHaveURL(/.*dashboard/);

    // Navigate to Staff Management
    await headteacherPage.click('text=Staff Directory');

    // Create a new staff member
    const timestamp = Date.now();
    const newStaffUsername = `teacher_${timestamp}`;
    const newStaffPassword = 'StaffPassword123!';

    await headteacherPage.click('text=Add Staff Member');
    await headteacherPage.fill('input[placeholder*="Full Name"]', 'Playwright Teacher');
    await headteacherPage.fill('input[placeholder*="Username"]', newStaffUsername);
    await headteacherPage.fill('input[placeholder*="Temporary Password"]', newStaffPassword);
    await headteacherPage.fill('input[placeholder*="Phone"]', '0555555555');

    await headteacherPage.click('button:has-text("Commission Staff Member")');

    // Verify success message or staff list entry
    await expect(headteacherPage.locator(`text=${newStaffUsername}`)).toBeVisible();

    // Optional: Wait for sync if needed
    // await headteacherPage.waitForTimeout(2000);

    // --- CONTEXT 2: NEW STAFF (Login) ---
    const staffContext = await browser.newContext();
    const staffPage = await staffContext.newPage();

    await staffPage.goto('http://localhost:5173/');

    // Login as new staff member
    await staffPage.fill('input[placeholder*="Username"]', newStaffUsername);
    await staffPage.fill('input[placeholder*="Password"]', newStaffPassword);
    await staffPage.click('button:has-text("Login")');

    // Verify dashboard access
    await expect(staffPage).toHaveURL(/.*dashboard/);
    await expect(staffPage.locator('text=Staff Identification')).toBeVisible(); // Or some teacher-specific text

    // Cleanup
    await headteacherContext.close();
    await staffContext.close();
});
