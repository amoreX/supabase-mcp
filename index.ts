#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import cors from "cors";
import { z } from "zod";
import * as bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { randomUUID } from "node:crypto";

// Load environment variables
dotenv.config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || "https://fyhwbvtutrlenkwjiffi.supabase.co";
const supabaseKey =
  process.env.SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5aHdidnR1dHJsZW5rd2ppZmZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY4OTg5ODMsImV4cCI6MjA2MjQ3NDk4M30.o0u2JLKF8sxBzEP4VCCQIOjb8KKlKqn7UyOltV8qo5vI";

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing required Supabase environment variables (SUPABASE_URL, SUPABASE_KEY)");
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Create MCP server
const server = new McpServer({
  name: "user-management-server",
  version: "1.0.0",
  description: "MCP server for user management with Supabase integration",
});

// Tool: Get all users
server.tool(
  "get_users",
  {}, // Empty schema for no parameters
  async () => {
    try {
      const { data, error } = await supabase.from("users").select("*");

      if (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error fetching users: ${error.message}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Internal server error: ${err}`,
          },
        ],
      };
    }
  },
);

// Tool: Get user by name or email
server.tool(
  "get_user",
  {
    identifier: z.string().describe("The user's name or email address"),
  },
  async ({ identifier }) => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .or(`name.ilike.%${identifier}%,email.ilike.%${identifier}%`);

      if (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error fetching user: ${error.message}`,
            },
          ],
        };
      }

      if (!data || data.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No user found with name or email containing: ${identifier}`,
            },
          ],
        };
      }

      if (data.length === 1) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data[0], null, 2),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Multiple users found:\n${JSON.stringify(
              data.map((u) => ({ id: u.id, name: u.name, email: u.email })),
              null,
              2,
            )}`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Internal server error: ${err}`,
          },
        ],
      };
    }
  },
);

// Tool: Create new user
server.tool(
  "create_user",
  {
    email: z.string().email().describe("User's email address"),
    password: z.string().min(6).describe("User's password (will be hashed)"),
    name: z.string().describe("User's full name"),
  },
  async ({ email, password, name }) => {
    try {
      // Hash the password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Insert user into database
      const { data, error: insertError } = await supabase
        .from("users")
        .insert([
          {
            email: email,
            name: name,
            password: hashedPassword,
            current_mental_state: "",
            recommendations: [],
          },
        ])
        .select()
        .single();

      if (insertError) {
        return {
          content: [
            {
              type: "text",
              text: `Error creating user: ${insertError.message}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `User created successfully: ${JSON.stringify(
              {
                id: data.id,
                email: data.email,
                name: data.name,
                created_at: data.created_at,
              },
              null,
              2,
            )}`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Internal server error: ${err}`,
          },
        ],
      };
    }
  },
);

// Tool: Update user mental state
server.tool(
  "update_mental_state",
  {
    identifier: z.string().describe("The user's name or email address"),
    mental_state: z.string().describe("The new mental state description"),
  },
  async ({ identifier, mental_state }) => {
    try {
      // First find the user
      const { data: users, error: findError } = await supabase
        .from("users")
        .select("*")
        .or(`name.ilike.%${identifier}%,email.ilike.%${identifier}%`);

      if (findError) {
        return {
          content: [
            {
              type: "text",
              text: `Error finding user: ${findError.message}`,
            },
          ],
        };
      }

      if (!users || users.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No user found with name or email containing: ${identifier}`,
            },
          ],
        };
      }

      if (users.length > 1) {
        return {
          content: [
            {
              type: "text",
              text: `Multiple users found. Please be more specific:\n${JSON.stringify(
                users.map((u) => ({ name: u.name, email: u.email })),
                null,
                2,
              )}`,
            },
          ],
        };
      }

      const user = users[0];
      const { data, error } = await supabase
        .from("users")
        .update({ current_mental_state: mental_state })
        .eq("id", user.id)
        .select()
        .single();

      if (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error updating mental state: ${error.message}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Mental state updated successfully for user: ${data.name} (${data.email})`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Internal server error: ${err}`,
          },
        ],
      };
    }
  },
);

// Tool: Add recommendation to user
server.tool(
  "add_recommendation",
  {
    identifier: z.string().describe("The user's name or email address"),
    recommendation: z.string().describe("The recommendation to add"),
  },
  async ({ identifier, recommendation }) => {
    try {
      // First find the user
      const { data: users, error: findError } = await supabase
        .from("users")
        .select("*")
        .or(`name.ilike.%${identifier}%,email.ilike.%${identifier}%`);

      if (findError) {
        return {
          content: [
            {
              type: "text",
              text: `Error finding user: ${findError.message}`,
            },
          ],
        };
      }

      if (!users || users.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No user found with name or email containing: ${identifier}`,
            },
          ],
        };
      }

      if (users.length > 1) {
        return {
          content: [
            {
              type: "text",
              text: `Multiple users found. Please be more specific:\n${JSON.stringify(
                users.map((u) => ({ name: u.name, email: u.email })),
                null,
                2,
              )}`,
            },
          ],
        };
      }

      const user = users[0];

      // Add new recommendation to existing array
      const currentRecommendations = user.recommendations || [];
      const updatedRecommendations = [
        ...currentRecommendations,
        recommendation,
      ];

      // Update the user with new recommendations
      const { data, error: updateError } = await supabase
        .from("users")
        .update({ recommendations: updatedRecommendations })
        .eq("id", user.id)
        .select()
        .single();

      if (updateError) {
        return {
          content: [
            {
              type: "text",
              text: `Error adding recommendation: ${updateError.message}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Recommendation added successfully to user: ${data.name} (${data.email}). Total recommendations: ${updatedRecommendations.length}`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Internal server error: ${err}`,
          },
        ],
      };
    }
  },
);

// Tool: Delete user
server.tool(
  "delete_user",
  {
    identifier: z.string().describe("The user's name or email address"),
  },
  async ({ identifier }) => {
    try {
      // First find the user
      const { data: users, error: findError } = await supabase
        .from("users")
        .select("*")
        .or(`name.ilike.%${identifier}%,email.ilike.%${identifier}%`);

      if (findError) {
        return {
          content: [
            {
              type: "text",
              text: `Error finding user: ${findError.message}`,
            },
          ],
        };
      }

      if (!users || users.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No user found with name or email containing: ${identifier}`,
            },
          ],
        };
      }

      if (users.length > 1) {
        return {
          content: [
            {
              type: "text",
              text: `Multiple users found. Please be more specific:\n${JSON.stringify(
                users.map((u) => ({ name: u.name, email: u.email })),
                null,
                2,
              )}`,
            },
          ],
        };
      }

      const user = users[0];
      const { error } = await supabase.from("users").delete().eq("id", user.id);

      if (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error deleting user: ${error.message}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `User ${user.name} (${user.email}) deleted successfully`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Internal server error: ${err}`,
          },
        ],
      };
    }
  },
);

// Resource: User list
server.resource("users", "users://list", async (uri) => {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id, email, name, created_at");

    if (error) {
      throw new Error(error.message);
    }

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  } catch (err) {
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "text/plain",
          text: `Error fetching users: ${err}`,
        },
      ],
    };
  }
});


// Create Express app for HTTP transport
const app = express();

// Security middleware
app.use(cors({
  origin: true, // IMPORTANT: For production, change 'true' to specific allowed origins.
  credentials: true
}));

app.use(express.json());

// **MCP HTTP Transport Setup**
const httpTransport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(), // Use crypto.randomUUID() for secure session IDs
  // onsessioninitialized: (sessionId) => console.log(`New MCP session: ${sessionId}`),
  // enableJsonResponse: false, // Default: prefers SSE. Set to true for JSON-only responses
  // eventStore: new YourCustomEventStore(), // Optional: for resumability
});

// !!! CRUCIAL FIX !!!
// Connect the McpServer to the transport. The server will now handle incoming messages
// from the transport automatically. No need to manually set httpTransport.onmessage.
server.connect(httpTransport)
  .then(() => console.log("MCP Server successfully connected to HTTP transport."))
  .catch(error => console.error("Failed to connect MCP Server to HTTP transport:", error));


// MCP HTTP endpoint
// This will use the handleRequest method of the StreamableHTTPServerTransport instance
app.all('/mcp', async (req, res) => {
  await httpTransport.handleRequest(req, res, req.body);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start the server
const PORT = parseInt(process.env.PORT || '3000', 10);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`MCP HTTP Server running on port ${PORT}`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully');
  process.exit(0);
});