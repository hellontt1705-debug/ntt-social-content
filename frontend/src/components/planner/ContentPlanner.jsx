import React, { useState, useMemo } from "react";
import { Icon } from "../Icons";
import PlannerKPIs from "./PlannerKPIs";
import PlannerToolbar from "./PlannerToolbar";
import DayView from "./DayView";
import WeekView from "./WeekView";
import MonthView from "./MonthView";
import ListView from "./ListView";
import FilterDrawer from "./FilterDrawer";
import PlannerStatsModal from "./PlannerStatsModal";
import ConfirmManualPostModal from "./ConfirmManualPostModal";
import ScheduleModal from "../ScheduleModal";
import { normalizeStatus, toLocalDateString } from "./PlannerConstants";
import { confirmCalendarEventPublished } from "../../api";

export default function ContentPlanner({
  calendarEvents = [],
  videos = [],
  categories = [],
  onSaveCalendarEvent,
  onDeleteCalendarEvent,
  onSelectVideoForDetail,
  onMarkVideoUsed,
  onOpenExportModal
}) {
  // Navigation & View Mode
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState("day"); // "day" | "week" | "month" | "list"
  
  // Selection
  const [selectedEventId, setSelectedEventId] = useState(null);

  // Modals & Drawers
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [confirmingEvent, setConfirmingEvent] = useState(null);

  // Filters
  const [selectedPlatforms, setSelectedPlatforms] = useState([
    "tiktok",
    "youtube_shorts",
    "instagram_reels",
    "x",
    "douyin"
  ]);
  const [filterStatuses, setFilterStatuses] = useState([]);
  const [filterCategoryId, setFilterCategoryId] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Helper: toggle platform in left column filter
  const handleTogglePlatform = (pId) => {
    setSelectedPlatforms((prev) =>
      prev.includes(pId) ? prev.filter((p) => p !== pId) : [...prev, pId]
    );
  };

  // Helper: date navigation
  const handleNavigate = (delta) => {
    const next = new Date(selectedDate);
    if (viewMode === "day") {
      next.setDate(next.getDate() + delta);
    } else if (viewMode === "week") {
      next.setDate(next.getDate() + delta * 7);
    } else if (viewMode === "month") {
      next.setMonth(next.getMonth() + delta);
    } else {
      next.setDate(next.getDate() + delta * 7);
    }
    setSelectedDate(next);
  };

  const handleToday = () => {
    setSelectedDate(new Date());
  };

  // Compute label for toolbar based on viewMode & selectedDate
  const dateLabel = useMemo(() => {
    const optionsDay = { weekday: "long", day: "numeric", month: "long", year: "numeric" };
    if (viewMode === "day") {
      return selectedDate.toLocaleDateString("vi-VN", optionsDay);
    }
    if (viewMode === "week") {
      const curr = new Date(selectedDate);
      const dayOfWeek = curr.getDay();
      const distanceToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(curr);
      monday.setDate(curr.getDate() + distanceToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return `${monday.getDate()}/${monday.getMonth() + 1} - ${sunday.getDate()}/${sunday.getMonth() + 1}/${sunday.getFullYear()}`;
    }
    if (viewMode === "month") {
      return `Tháng ${selectedDate.getMonth() + 1}, ${selectedDate.getFullYear()}`;
    }
    return "Tất cả kế hoạch";
  }, [viewMode, selectedDate]);

  // Compute Week KPIs dynamically
  const kpiStats = useMemo(() => {
    const curr = new Date(selectedDate);
    const dayOfWeek = curr.getDay();
    const distanceToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(curr);
    monday.setDate(curr.getDate() + distanceToMonday);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const mondayIso = toLocalDateString(monday);
    const sundayIso = toLocalDateString(sunday);

    const weekEvents = calendarEvents.filter(
      (ev) => ev.scheduled_date >= mondayIso && ev.scheduled_date <= sundayIso
    );

    let publishedCount = 0;
    let missedCount = 0;
    let pendingCount = 0;

    weekEvents.forEach((ev) => {
      const st = normalizeStatus(ev).id;
      if (st === "PUBLISHED_MANUALLY") publishedCount++;
      else if (st === "MISSED") missedCount++;
      else pendingCount++;
    });

    return {
      totalWeek: weekEvents.length,
      publishedCount,
      pendingCount,
      missedCount,
      weeklyTarget: 14
    };
  }, [calendarEvents, selectedDate]);

  // Confirm manual publication
  const handleConfirmPublished = async (eventId, data) => {
    try {
      await confirmCalendarEventPublished(eventId, data);
      // Reload or update event optimistically
      const ev = calendarEvents.find((e) => e.id === eventId);
      if (ev) {
        if (onSaveCalendarEvent) {
          onSaveCalendarEvent({
            ...ev,
            status: "PUBLISHED_MANUALLY",
            published_at: data.published_at,
            published_url: data.published_url,
            manual_note: data.manual_note
          });
        }
        if (ev.video_id && onMarkVideoUsed) {
          onMarkVideoUsed(ev.video_id, true);
        }
      }
    } catch (err) {
      alert("Lỗi: " + err.message);
    }
  };

  // Reschedule handler
  const handleRescheduleEvent = (ev) => {
    setEditingEvent(ev);
    setIsCreateModalOpen(true);
  };

  // Edit event
  const handleEditEvent = (ev) => {
    setEditingEvent(ev);
    setIsCreateModalOpen(true);
  };

  // Find video associated with confirming event
  const confirmingVideo = confirmingEvent
    ? videos.find((v) => v.id === confirmingEvent.video_id)
    : null;

  // Find video for create/edit modal
  const editingVideo = editingEvent
    ? videos.find((v) => v.id === editingEvent.video_id)
    : (videos.length > 0 ? videos[0] : null);

  return (
    <div className="view-content" style={{ padding: "10px 16px", boxSizing: "border-box" }}>
      {/* 1. KPI Cards */}
      <PlannerKPIs stats={kpiStats} />

      {/* 2. Toolbar (Navigation, Date, View Switcher, Filter, Stats, New Schedule) */}
      <PlannerToolbar
        viewMode={viewMode}
        setViewMode={setViewMode}
        selectedDate={selectedDate}
        onNavigate={handleNavigate}
        onToday={handleToday}
        dateLabel={dateLabel}
        onToggleFilter={() => setIsFilterOpen(true)}
        activeFilterCount={filterStatuses.length + (filterCategoryId !== "all" ? 1 : 0)}
        onOpenStats={() => setIsStatsOpen(true)}
        onOpenCreate={() => {
          setEditingEvent(null);
          setIsCreateModalOpen(true);
        }}
      />

      {/* 3. Active View */}
      {viewMode === "day" && (
        <DayView
          selectedDate={selectedDate}
          onSelectDate={(d) => setSelectedDate(d)}
          events={calendarEvents}
          videos={videos}
          selectedEventId={selectedEventId}
          onSelectEvent={(id) => setSelectedEventId(id)}
          selectedPlatforms={selectedPlatforms}
          onTogglePlatformFilter={handleTogglePlatform}
          onEditEvent={handleEditEvent}
          onCreateEvent={(dateObj) => {
            if (dateObj) setSelectedDate(dateObj);
            setEditingEvent(null);
            setIsCreateModalOpen(true);
          }}
          onConfirmPublished={(ev) => setConfirmingEvent(ev)}
          onRescheduleEvent={handleRescheduleEvent}
          onDeleteEvent={onDeleteCalendarEvent}
          onOpenExportModal={onOpenExportModal}
          onSelectVideoForDetail={onSelectVideoForDetail}
        />
      )}

      {viewMode === "week" && (
        <WeekView
          selectedDate={selectedDate}
          onSelectDate={(d) => setSelectedDate(d)}
          events={calendarEvents}
          videos={videos}
          categories={categories}
          selectedEventId={selectedEventId}
          onSelectEvent={(id) => setSelectedEventId(id)}
          onEditEvent={handleEditEvent}
          onCreateEvent={(dateObj, timeSlot) => {
            if (dateObj) setSelectedDate(dateObj);
            setEditingEvent(null);
            setIsCreateModalOpen(true);
          }}
          onConfirmPublished={(ev) => setConfirmingEvent(ev)}
          onDeleteEvent={onDeleteCalendarEvent}
          onRescheduleEvent={handleRescheduleEvent}
          selectedPlatforms={selectedPlatforms}
          onTogglePlatformFilter={handleTogglePlatform}
          filterStatuses={filterStatuses}
          setFilterStatuses={setFilterStatuses}
          filterCategoryId={filterCategoryId}
          setFilterCategoryId={setFilterCategoryId}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onOpenExportModal={onOpenExportModal}
          onSelectVideoForDetail={onSelectVideoForDetail}
        />
      )}

      {viewMode === "month" && (
        <MonthView
          selectedDate={selectedDate}
          onSelectDate={(d) => setSelectedDate(d)}
          events={calendarEvents}
          onSwitchToDayView={() => setViewMode("day")}
          onSelectEvent={(id) => {
            setSelectedEventId(id);
            setViewMode("day");
          }}
        />
      )}

      {viewMode === "list" && (
        <ListView
          events={calendarEvents}
          videos={videos}
          onSelectEvent={(id) => {
            setSelectedEventId(id);
            setViewMode("day");
          }}
          onEditEvent={handleEditEvent}
          onConfirmPublished={(ev) => setConfirmingEvent(ev)}
          onRescheduleEvent={handleRescheduleEvent}
          onDeleteEvent={onDeleteCalendarEvent}
          onSelectVideoForDetail={onSelectVideoForDetail}
        />
      )}

      {/* 5. Modals & Drawers */}
      {/* Confirm Manual Post Modal */}
      <ConfirmManualPostModal
        isOpen={Boolean(confirmingEvent)}
        onClose={() => setConfirmingEvent(null)}
        event={confirmingEvent}
        video={confirmingVideo}
        onConfirm={handleConfirmPublished}
      />

      {/* Filter Drawer */}
      <FilterDrawer
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        categories={categories}
        filters={{
          platforms: selectedPlatforms,
          statuses: filterStatuses,
          categoryId: filterCategoryId,
          searchQuery
        }}
        onApplyFilters={(f) => {
          setSelectedPlatforms(f.platforms || []);
          setFilterStatuses(f.statuses || []);
          setFilterCategoryId(f.categoryId || "all");
        }}
        onResetFilters={() => {
          setSelectedPlatforms(["tiktok", "youtube_shorts", "instagram_reels", "x", "douyin"]);
          setFilterStatuses([]);
          setFilterCategoryId("all");
        }}
      />

      {/* Stats Modal */}
      <PlannerStatsModal
        isOpen={isStatsOpen}
        onClose={() => setIsStatsOpen(false)}
        events={calendarEvents}
      />

      {/* Create / Edit Schedule Modal */}
      {isCreateModalOpen && (
        <ScheduleModal
          isOpen={isCreateModalOpen}
          onClose={() => {
            setIsCreateModalOpen(false);
            setEditingEvent(null);
          }}
          video={editingVideo}
          onSave={(eventData) => {
            if (onSaveCalendarEvent) {
              onSaveCalendarEvent({
                ...eventData,
                id: editingEvent ? editingEvent.id : eventData.id
              });
            }
            setIsCreateModalOpen(false);
            setEditingEvent(null);
          }}
        />
      )}
    </div>
  );
}
