#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import express from "express";
import cors from "cors";
import { z } from "zod";
import * as bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Initialize Supabase client
const supabaseUrl = "https://fyhwbvtutrlenkwjiffi.supabase.co";
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5aHdidnR1dHJsZW5rd2ppZmZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY4OTg5ODMsImV4cCI6MjA2MjQ3NDk4M30.o0u2JLKF8sxBzEP4VCCQIOjb8KKkxn7UyOltV8qo5vI";

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing required Supabase environment variables");
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
  origin: true, // You should restrict this in production
  credentials: true
}));

app.use(express.json());

// Session management
const sessions = new Map<string, any>();

function generateSessionId(): string {
  return crypto.randomUUID();
}

function validateOrigin(req: express.Request): boolean {
  // Basic origin validation - enhance this for production
  const origin = req.get('origin');
  // Allow requests without origin (e.g., server-to-server)
  if (!origin) return true;
  
  // You should implement proper origin validation here
  return true;
}

// MCP HTTP endpoint
app.all('/mcp', async (req: express.Request, res: express.Response) => {
  // Validate origin for security
  if (!validateOrigin(req)) {
    return res.status(403).json({ error: 'Forbidden origin' });
  }

  const sessionId = req.get('Mcp-Session-Id');
  
  if (req.method === 'POST') {
    try {
      const accept = req.get('accept') || '';
      
      if (!accept.includes('application/json') && !accept.includes('text/event-stream')) {
        return res.status(400).json({ error: 'Invalid Accept header' });
      }

      const message = req.body;
      
      // Handle initialization specially
      if (message.method === 'initialize') {
        const result = await server.handleRequest(message);
        const newSessionId = generateSessionId();
        sessions.set(newSessionId, { initialized: true });
        
        res.set('Mcp-Session-Id', newSessionId);
        res.set('Content-Type', 'application/json');
        return res.json(result);
      }
      
      // Validate session for non-initialization requests
      if (sessionId && !sessions.has(sessionId)) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      // Handle other MCP messages
      if (Array.isArray(message)) {
        // Batch request
        const hasRequests = message.some(msg => msg.method && !msg.result && !msg.error);
        
        if (hasRequests) {
          // Use SSE for requests
          res.set('Content-Type', 'text/event-stream');
          res.set('Cache-Control', 'no-cache');
          res.set('Connection', 'keep-alive');
          
          const results = [];
          for (const msg of message) {
            if (msg.method) {
              const result = await server.handleRequest(msg);
              results.push(result);
            }
          }
          
          res.write(`data: ${JSON.stringify(results)}\n\n`);
          res.end();
        } else {
          // Only notifications/responses
          return res.status(202).send();
        }
      } else {
        // Single message
        if (message.method && !message.result && !message.error) {
          // Request - use either JSON or SSE based on Accept header
          if (accept.includes('text/event-stream')) {
            res.set('Content-Type', 'text/event-stream');
            res.set('Cache-Control', 'no-cache');
            res.set('Connection', 'keep-alive');
            
            const result = await server.handleRequest(message);
            res.write(`data: ${JSON.stringify(result)}\n\n`);
            res.end();
          } else {
            const result = await server.handleRequest(message);
            res.json(result);
          }
        } else {
          // Notification or response
          return res.status(202).send();
        }
      }
    } catch (error) {
      console.error('MCP request error:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  } else if (req.method === 'GET') {
    // SSE stream for server-initiated messages
    const accept = req.get('accept') || '';
    
    if (!accept.includes('text/event-stream')) {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }
    
    res.set('Content-Type', 'text/event-stream');
    res.set('Cache-Control', 'no-cache');
    res.set('Connection', 'keep-alive');
    
    // Keep connection alive with periodic heartbeat
    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 30000);
    
    req.on('close', () => {
      clearInterval(heartbeat);
    });
    
  } else if (req.method === 'DELETE') {
    // Session termination
    if (sessionId && sessions.has(sessionId)) {
      sessions.delete(sessionId);
      return res.status(200).send();
    }
    return res.status(404).json({ error: 'Session not found' });
  } else {
    res.status(405).json({ error: 'Method Not Allowed' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start the server
const PORT = process.env.PORT || 3000;

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