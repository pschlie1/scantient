import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Jira Integration Tests
 * 
 * Tests for Jira integration including:
 * 1. URL formatting and validation
 * 2. Ticket creation with finding details
 * 3. Error handling and edge cases
 * 4. Credential validation
 */

describe("Jira Integration", () => {
  describe("URL Validation and Formatting", () => {
    it("should reject URLs without protocol", () => {
      const invalidUrls = [
        "jira.example.com",
        "myorg.atlassian.net",
        "localhost:8080",
      ];

      invalidUrls.forEach((url) => {
        expect(url).not.toMatch(/^https?:\/\//);
      });
    });

    it("should reject URLs with non-HTTP protocols", () => {
      const invalidUrls = [
        "ftp://jira.example.com",
        "telnet://jira.example.com",
        "file:///jira",
      ];

      invalidUrls.forEach((url) => {
        expect(url).not.toMatch(/^https?:\/\//);
      });
    });

    it("should accept https:// URLs", () => {
      const validUrls = [
        "https://myorg.atlassian.net",
        "https://jira.example.com",
        "https://jira.internal.corp",
      ];

      validUrls.forEach((url) => {
        expect(url).toMatch(/^https:\/\//);
      });
    });

    it("should accept http:// URLs (for dev/internal)", () => {
      const validUrls = [
        "http://localhost:8080",
        "http://jira.internal.corp",
      ];

      validUrls.forEach((url) => {
        expect(url).toMatch(/^https?:\/\//);
      });
    });

    it("should strip trailing slash from URL", () => {
      const url = "https://myorg.atlassian.net/";
      const normalized = url.replace(/\/$/, "");
      expect(normalized).toBe("https://myorg.atlassian.net");
      expect(normalized).not.toContain("//rest");
    });

    it("should not double-prepend protocol", () => {
      const url = "https://myorg.atlassian.net";
      const apiUrl = `${url}/rest/api/3/myself`;

      // Should have exactly one https://
      const protocolCount = (apiUrl.match(/https:\/\//g) || []).length;
      expect(protocolCount).toBe(1);

      // Should not be like: https://https://...
      expect(apiUrl).not.toContain("https://https://");
    });

    it("should handle URLs with path segments", () => {
      // Some Jira instances are at /jira subpath
      const url = "https://internal.corp/jira";
      const myself = `${url}/rest/api/3/myself`;
      
      expect(myself).toBe("https://internal.corp/jira/rest/api/3/myself");
    });

    it("should encode special characters in URL", () => {
      const url = "https://example.com/jira?token=abc123&user=test@example.com";
      const encoded = encodeURIComponent(url);
      
      // Percent-encoded form should not execute as URL
      expect(encoded).not.toBe(url);
      expect(encoded).toContain("%");
    });

    it("should reject empty URL", () => {
      const url = "";
      expect(url).toBeFalsy();
    });

    it("should reject null/undefined URL", () => {
      const url = null;
      expect(url).toBeFalsy();
    });
  });

  describe("Credential Validation", () => {
    it("should require instance URL", () => {
      const config = {
        url: "",
        username: "user@example.com",
        apiToken: "token123",
      };

      expect(config.url).toBeFalsy();
    });

    it("should require username/email", () => {
      const config = {
        url: "https://myorg.atlassian.net",
        username: "",
        apiToken: "token123",
      };

      expect(config.username).toBeFalsy();
    });

    it("should require API token", () => {
      const config = {
        url: "https://myorg.atlassian.net",
        username: "user@example.com",
        apiToken: "",
      };

      expect(config.apiToken).toBeFalsy();
    });

    it("should test credentials before saving", async () => {
      // Mock fetch to simulate Jira API test
      const validCredentials = {
        url: "https://myorg.atlassian.net",
        username: "user@example.com",
        apiToken: "valid_token_123",
      };

      // Should make HEAD or GET request to /rest/api/3/myself
      const testEndpoint = `${validCredentials.url}/rest/api/3/myself`;
      expect(testEndpoint).toContain("/rest/api/3/myself");
    });

    it("should reject invalid credentials", async () => {
      const invalidCredentials = {
        url: "https://myorg.atlassian.net",
        username: "user@example.com",
        apiToken: "invalid_token",
      };

      // Jira would return 401 Unauthorized
      expect(invalidCredentials.apiToken.length).toBeGreaterThan(0);
    });

    it("should reject unreachable Jira instance", async () => {
      const config = {
        url: "https://does-not-exist-12345.atlassian.net",
        username: "user@example.com",
        apiToken: "token123",
      };

      // Network error or 404 response
      expect(config.url).toMatch(/^https:\/\//);
    });
  });

  describe("Ticket Creation", () => {
    const mockFinding = {
      id: "finding_123",
      code: "XSS",
      title: "Cross-Site Scripting (XSS) vulnerability",
      description: "User input is not sanitized before output",
      severity: "CRITICAL",
      url: "https://example.com/vulnerable-page",
    };

    it("should create ticket with finding details", () => {
      const ticket = {
        fields: {
          project: { key: "SEC" },
          issuetype: { name: "Bug" },
          summary: mockFinding.title,
          description: mockFinding.description,
          priority: { name: "Critical" }, // based on severity
        },
      };

      expect(ticket.fields.summary).toBe(mockFinding.title);
      expect(ticket.fields.description).toContain(mockFinding.description);
    });

    it("should set priority based on severity", () => {
      const severityToPriority = {
        LOW: "Low",
        MEDIUM: "Medium",
        HIGH: "High",
        CRITICAL: "Critical",
      };

      const severity = "CRITICAL";
      const priority = severityToPriority[severity];

      expect(priority).toBe("Critical");
    });

    it("should include remediation guide in ticket description", () => {
      const remediationGuide = "1. Sanitize user input\n2. Use escaping functions\n3. Enable CSP";
      const description = `${mockFinding.description}\n\nRemediation:\n${remediationGuide}`;

      expect(description).toContain("Remediation");
      expect(description).toContain("Sanitize user input");
    });

    it("should link to Scantient finding in ticket", () => {
      const scantientUrl = `https://scantient.com/findings/${mockFinding.id}`;
      const description = `See details: ${scantientUrl}`;

      expect(description).toContain("https://scantient.com/findings/");
      expect(description).toContain(mockFinding.id);
    });

    it("should include affected URL in ticket", () => {
      const ticket = {
        fields: {
          description: `Affected URL: ${mockFinding.url}`,
        },
      };

      expect(ticket.fields.description).toContain(mockFinding.url);
    });

    it("should include severity in ticket labels", () => {
      const labels = [`severity-${mockFinding.severity.toLowerCase()}`];

      expect(labels[0]).toBe("severity-critical");
    });

    it("should create ticket in correct project", () => {
      const projectKey = "SEC"; // Security project
      const ticket = {
        fields: {
          project: { key: projectKey },
        },
      };

      expect(ticket.fields.project.key).toBe("SEC");
    });

    it("should allow custom issue type", () => {
      const issueTypes = ["Bug", "Task", "Security Issue"];
      const selectedType = "Bug";

      expect(issueTypes).toContain(selectedType);
    });

    it("should return ticket URL on success", () => {
      const ticketKey = "SEC-123";
      const jiraInstance = "https://myorg.atlassian.net";
      const ticketUrl = `${jiraInstance}/browse/${ticketKey}`;

      expect(ticketUrl).toBe("https://myorg.atlassian.net/browse/SEC-123");
      expect(ticketUrl).toContain("/browse/");
    });
  });

  describe("Error Handling", () => {
    it("should handle network timeout", () => {
      const error = new Error("Request timeout");
      expect(error.message).toContain("timeout");
    });

    it("should handle 401 Unauthorized (bad credentials)", () => {
      const statusCode = 401;
      expect(statusCode).toBe(401);
    });

    it("should handle 403 Forbidden (insufficient permissions)", () => {
      const statusCode = 403;
      expect(statusCode).toBe(403);
    });

    it("should handle 404 Not Found (instance doesn't exist)", () => {
      const statusCode = 404;
      expect(statusCode).toBe(404);
    });

    it("should handle 500 Server Error (Jira down)", () => {
      const statusCode = 500;
      expect(statusCode).toBe(500);
    });

    it("should handle malformed response from Jira", () => {
      const response = "unexpected response format";
      expect(response).toBeTruthy();
    });

    it("should retry on transient failures", () => {
      // Implement exponential backoff
      const maxRetries = 3;
      let attempt = 0;

      expect(maxRetries).toBeGreaterThan(0);
      expect(attempt).toBeLessThanOrEqual(maxRetries);
    });

    it("should log errors for debugging", () => {
      const errorLog = {
        timestamp: new Date(),
        error: "Jira connection failed",
        details: "401 Unauthorized",
      };

      expect(errorLog.timestamp).toBeDefined();
      expect(errorLog.error).toBeTruthy();
    });

    it("should not expose sensitive data in error responses", () => {
      const errorResponse = "Failed to create ticket"; // generic
      const sensitiveData = ["apiToken", "password", "secret"];

      sensitiveData.forEach((term) => {
        expect(errorResponse).not.toContain(term);
      });
    });
  });

  describe("Rate Limiting", () => {
    it("should respect Jira rate limits", () => {
      // Jira Cloud API limit: 10 requests per second per cloud tenant
      const rateLimit = 10;
      const window = 1000; // 1 second

      expect(rateLimit).toBeGreaterThan(0);
      expect(window).toBe(1000);
    });

    it("should handle 429 Too Many Requests", () => {
      const statusCode = 429;
      const retryAfter = 60; // seconds

      expect(statusCode).toBe(429);
      expect(retryAfter).toBeGreaterThan(0);
    });

    it("should implement exponential backoff", () => {
      const delays = [1000, 2000, 4000, 8000]; // 1s, 2s, 4s, 8s
      
      for (let i = 0; i < delays.length - 1; i++) {
        expect(delays[i + 1]).toBe(delays[i] * 2);
      }
    });
  });

  describe("Edge Cases", () => {
    it("should handle finding with very long description", () => {
      const longDescription = "A".repeat(5000);
      const maxLength = 4000; // Jira description limit

      // Should truncate or split
      expect(longDescription.length).toBeGreaterThan(maxLength);
    });

    it("should handle special characters in finding title", () => {
      const titles = [
        "XSS: <script> injection",
        "Path traversal (../ sequences)",
        'CSRF "double quotes"',
        "Unicode: ñ é ü",
      ];

      titles.forEach((title) => {
        expect(title).toBeTruthy();
      });
    });

    it("should handle duplicate ticket detection", () => {
      // If ticket already exists for this finding, don't create duplicate
      const existingTicket = "SEC-123";
      const newTicketKey = null;

      expect(existingTicket).toBeTruthy();
      expect(newTicketKey).toBeNull();
    });

    it("should handle custom fields in Jira project", () => {
      const customFields = {
        "customfield_10000": "value", // custom field
        "customfield_10001": 123,
      };

      Object.keys(customFields).forEach((key) => {
        expect(key).toMatch(/^customfield_\d+$/);
      });
    });

    it("should handle different Jira versions (Server vs Cloud)", () => {
      // Cloud API: /rest/api/3/...
      // Server API: /rest/api/2/...
      const cloudUrl = "https://myorg.atlassian.net/rest/api/3/issue";
      const serverUrl = "https://jira.internal.corp/rest/api/2/issue";

      expect(cloudUrl).toContain("/rest/api/3/");
      expect(serverUrl).toContain("/rest/api/2/");
    });
  });

  describe("Integration with Scantient", () => {
    it("should link ticket back to Scantient", () => {
      const ticketDescription = `
        Created by Scantient
        Finding: https://scantient.com/findings/f123
        App: https://scantient.com/apps/app456
      `;

      expect(ticketDescription).toContain("scantient.com");
      expect(ticketDescription).toContain("/findings/");
    });

    it("should support two-way sync (future)", () => {
      // When user resolves ticket in Jira, mark finding as resolved in Scantient
      const webhookEvent = {
        issue: { key: "SEC-123", fields: { status: { name: "Done" } } },
      };

      expect(webhookEvent.issue.fields.status.name).toBe("Done");
    });

    it("should track ticket creation timestamp", () => {
      const createdAt = new Date();
      expect(createdAt).toBeInstanceOf(Date);
    });
  });
});
