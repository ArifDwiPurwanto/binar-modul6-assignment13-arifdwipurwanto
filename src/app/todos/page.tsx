"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "react-hot-toast";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/hooks/useAuth";
import { TokenExpirationWarning } from "@/components/TokenExpirationWarning";
import { SessionTimer } from "@/components/SessionTimer";
import TodoItem from "@/components/TodoItem";
import TodoForm from "@/components/TodoForm";
import TodoStats from "@/components/TodoStats";
import {
  Todo,
  CreateTodoRequest,
  TodoStats as TodoStatsType,
  TodoFilters,
} from "@/lib/types";

export default function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [stats, setStats] = useState<TodoStatsType | null>(null);
  const [loading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showStats, setShowStats] = useState(true);

  const [filters, setFilters] = useState<TodoFilters>({
    status: "",
    priority: "",
    search: "",
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const { requireAuth } = useAuth();

  useEffect(() => {
    requireAuth("/login");
  }, [requireAuth]);

  const fetchTodos = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        ...(filters.status && { status: filters.status }),
        ...(filters.priority && { priority: filters.priority }),
        ...(filters.search && { search: filters.search }),
      });

      const response = await fetch(`/api/todos?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setTodos(data.data.data);
        setPagination((prev) => ({
          ...prev,
          total: data.data.pagination.total,
          totalPages: data.data.pagination.totalPages,
        }));
      } else {
        toast.error("Failed to load todos");
      }
    } catch (error) {
      console.error("Fetch todos error:", error);
      toast.error("Failed to load todos");
    } finally {
      setIsLoading(false);
    }
  }, [filters, pagination.page, pagination.limit]);

  const fetchStats = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/todos/stats", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data.data);
      }
    } catch (error) {
      console.error("Fetch stats error:", error);
    }
  }, []);

  useEffect(() => {
    fetchTodos();
    fetchStats();
  }, [fetchTodos, fetchStats]);

  const handleCreateTodo = async (todoData: CreateTodoRequest) => {
    setSaving(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/todos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(todoData),
      });

      if (response.ok) {
        const data = await response.json();
        setTodos((prev) => [data.data, ...prev]);
        setShowCreateForm(false);
        toast.success("Todo created successfully");
        fetchStats();
      } else {
        const errorData = await response.json();
        toast.error(errorData.message || "Failed to create todo");
      }
    } catch (error) {
      console.error("Create todo error:", error);
      toast.error("Failed to create todo");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateTodo = async (todo: Todo) => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/todos/${todo.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(todo),
      });

      if (response.ok) {
        const data = await response.json();
        setTodos((prev) => prev.map((t) => (t.id === todo.id ? data.data : t)));
        toast.success("Todo updated successfully");
        fetchStats();
      } else {
        const errorData = await response.json();
        toast.error(errorData.message || "Failed to update todo");
      }
    } catch (error) {
      console.error("Update todo error:", error);
      toast.error("Failed to update todo");
    }
  };

  const handleDeleteTodo = async (id: number) => {
    if (!confirm("Are you sure you want to delete this todo?")) return;

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/todos/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        setTodos((prev) => prev.filter((t) => t.id !== id));
        toast.success("Todo deleted successfully");
        fetchStats();
      } else {
        toast.error("Failed to delete todo");
      }
    } catch (error) {
      console.error("Delete todo error:", error);
      toast.error("Failed to delete todo");
    }
  };

  const handleStatusChange = async (id: number, status: Todo["status"]) => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/todos/${id}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });

      if (response.ok) {
        const data = await response.json();
        setTodos((prev) => prev.map((t) => (t.id === id ? data.data : t)));
        toast.success("Status updated successfully");
        fetchStats();
      } else {
        toast.error("Failed to update status");
      }
    } catch (error) {
      console.error("Status update error:", error);
      toast.error("Failed to update status");
    }
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading todos...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <TokenExpirationWarning />
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  📋 My Todos
                </h1>
                <p className="mt-2 text-gray-600">
                  Manage your tasks and stay organized with our powerful todo
                  management system
                </p>
              </div>
              <div className="flex items-center space-x-4">
                <SessionTimer />
                <button
                  onClick={() => setShowStats(!showStats)}
                  className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors"
                >
                  {showStats ? "📊 Hide Stats" : "📊 Show Stats"}
                </button>
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors flex items-center"
                >
                  ➕ Add Todo
                </button>
              </div>
            </div>

            {/* Statistics */}
            {stats && showStats && (
              <div className="mt-6">
                <TodoStats stats={stats} />
              </div>
            )}
          </div>

          {/* Filters */}
          <div className="bg-white p-6 rounded-lg shadow mb-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Search
                </label>
                <input
                  type="text"
                  placeholder="Search todos..."
                  value={filters.search}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, search: e.target.value }))
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  value={filters.status}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, status: e.target.value }))
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="in-progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Priority
                </label>
                <select
                  value={filters.priority}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      priority: e.target.value,
                    }))
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">All Priorities</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={() =>
                    setFilters({ status: "", priority: "", search: "" })
                  }
                  className="w-full bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400 transition-colors"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          </div>

          {/* Create Todo Form */}
          {showCreateForm && (
            <div className="mb-6">
              <TodoForm
                onSubmit={handleCreateTodo}
                onCancel={() => setShowCreateForm(false)}
                isLoading={saving}
                title="Create New Todo"
              />
            </div>
          )}

          {/* Todos List */}
          <div className="space-y-4">
            {todos.length === 0 ? (
              <div className="bg-white p-8 rounded-lg shadow text-center">
                <div className="text-6xl mb-4">📝</div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No todos found
                </h3>
                <p className="text-gray-500 mb-4">
                  Get started by creating your first todo!
                </p>
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors"
                >
                  ➕ Create Your First Todo
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {todos.map((todo) => (
                  <TodoItem
                    key={todo.id}
                    todo={todo}
                    onUpdate={handleUpdateTodo}
                    onDelete={handleDeleteTodo}
                    onStatusChange={handleStatusChange}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="mt-6 flex justify-center">
              <nav className="flex space-x-2">
                <button
                  onClick={() =>
                    setPagination((prev) => ({ ...prev, page: prev.page - 1 }))
                  }
                  disabled={pagination.page === 1}
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="px-3 py-2 text-sm text-gray-700">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <button
                  onClick={() =>
                    setPagination((prev) => ({ ...prev, page: prev.page + 1 }))
                  }
                  disabled={pagination.page === pagination.totalPages}
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Next
                </button>
              </nav>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
