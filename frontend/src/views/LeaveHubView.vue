<template>
  <div class="leave-hub" :class="isSupervisor ? 'leave-hub--supervisor-split' : 'leave-hub--single'">
    <div class="leave-obj-header">
      <div class="leave-obj-header__titles">
        <h1 class="page-title">{{ isLs ? 'Leave Request' : 'Leave Approvals' }}</h1>
        <p class="page-subtitle">Cuti, Izin, and Sakit</p>
      </div>
    </div>

    <template v-if="isLs">
      <div class="leave-grid">
        <div class="card leave-new-card">
          <div class="card-header">
            <span class="card-title">New Request</span>
          </div>
          <div class="card-body">
            <div v-if="formSuccess" class="alert alert-success"><span>✅</span> {{ formSuccess }}</div>
            <div v-if="formWarning" class="alert alert-warning" role="alert">
              <span class="alert-icon" aria-hidden="true">!</span>
              <span>
                <span class="alert-title">{{ formWarningTitle }}</span>
                <span class="alert-body">{{ formWarning }}</span>
              </span>
            </div>
            <div v-if="formError" class="alert alert-error"><span>⚠️</span> {{ formError }}</div>
            <form @submit.prevent="submitLeave">
              <div class="form-group">
                <label class="form-label">Request Type</label>
                <select v-model="form.request_type" class="form-control" required>
                  <option value="cuti">Cuti</option>
                  <option value="izin">Izin</option>
                  <option value="sakit">Sakit</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Start Date</label>
                <input v-model="form.start_date" type="date" class="form-control" required />
              </div>
              <div class="form-group">
                <label class="form-label">End Date</label>
                <input v-model="form.end_date" type="date" class="form-control" required />
              </div>
              <div class="form-group">
                <label class="form-label">
                  Remarks
                  <span v-if="reasonRequired" class="req">*</span>
                  <span v-else class="text-muted text-sm">(optional)</span>
                </label>
                <textarea
                  v-model="form.reason"
                  class="form-control"
                  rows="3"
                  maxlength="2000"
                  :required="reasonRequired"
                  :placeholder="reasonPlaceholder"
                />
              </div>
              <p v-if="dayCount !== null" class="text-sm text-muted" style="margin-bottom:12px;">
                Duration: <strong>{{ dayCount }}</strong> day(s)
              </p>
              <button type="submit" class="btn btn-primary w-full" :disabled="submitting">
                <span v-if="submitting" class="spinner" style="width:16px;height:16px;border-width:2px;"></span>
                {{ submitting ? 'Submitting…' : 'Submit Request' }}
              </button>
            </form>
          </div>
        </div>

        <div class="card leave-list-card">
          <div class="card-header">
            <span class="card-title">Request List</span>
            <div class="toolbar-filters">
              <select v-model="filterRequestType" class="form-control toolbar-select" @change="onFilterChange">
                <option value="">All Types</option>
                <option value="cuti">Cuti</option>
                <option value="izin">Izin</option>
                <option value="sakit">Sakit</option>
              </select>
              <select v-model="filterStatus" class="form-control toolbar-select" @change="onFilterChange">
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="cancelled">Cancelled</option>
                <option value="withdrawn">Withdrawn</option>
              </select>
            </div>
          </div>
          <div class="table-wrapper leave-ls-table" style="border:none;border-radius:0;border-top:1px solid var(--bc-gray-200);">
            <div v-if="loading" class="loading-overlay"><span class="spinner"></span> Loading…</div>
            <table v-else>
              <colgroup>
                <col style="width:84px;" />
                <col style="width:230px;" />
                <col style="width:64px;" />
                <col />
                <col style="width:140px;" />
                <col style="width:170px;" />
              </colgroup>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Period</th>
                  <th>Days</th>
                  <th>Remarks</th>
                  <th>Approval Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="records.length === 0">
                  <td colspan="6">
                    <div class="empty-state">
                      <div class="empty-state-icon">📋</div>
                      <h3>No requests yet</h3>
                      <p>Use the form on the left or adjust the filter.</p>
                    </div>
                  </td>
                </tr>
                <tr v-for="r in records" :key="r.id">
                  <td><span class="badge badge-type">{{ typeLabel(r.request_type) }}</span></td>
                  <td>
                    <div class="font-bold">{{ fmtRange(r.start_date, r.end_date) }}</div>
                    <div class="text-sm text-muted">{{ fmtShort(r.start_date) }} – {{ fmtShort(r.end_date) }}</div>
                  </td>
                  <td>{{ countDays(r.start_date, r.end_date) }}</td>
                  <td><span class="cell-reason">{{ r.reason || '—' }}</span></td>
                  <td><span class="badge" :class="`badge-${r.status}`">{{ statusLabel(r.status) }}</span></td>
                  <td>
                    <div class="row-actions">
                      <button
                        v-if="r.status === 'pending'"
                        type="button"
                        class="btn btn-outline btn-sm btn-cancel"
                        :disabled="lifecycleId === r.id"
                        title="Cancel this pending leave request"
                        @click="openLifecycleConfirm(r, 'cancel')"
                      >Cancel</button>
                      <button
                        v-else-if="r.status === 'approved'"
                        type="button"
                        class="btn btn-outline btn-sm btn-withdraw"
                        :disabled="lifecycleId === r.id"
                        title="Withdraw this approved leave"
                        @click="openLifecycleConfirm(r, 'withdraw')"
                      >Withdraw</button>
                      <span v-else class="text-muted text-sm">—</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="pagination.total > 0" class="card-body" style="padding-top:12px;border-top:1px solid var(--bc-gray-100);">
            <div class="pagination">
              <span class="pagination-info">
                {{ ((pagination.page - 1) * pagination.limit) + 1 }}–{{ Math.min(pagination.page * pagination.limit, pagination.total) }} of {{ pagination.total }}
              </span>
              <button class="btn btn-ghost btn-sm" :disabled="pagination.page <= 1" @click="changePage(pagination.page - 1)">‹ Prev</button>
              <button class="btn btn-ghost btn-sm" :disabled="pagination.page * pagination.limit >= pagination.total" @click="changePage(pagination.page + 1)">Next ›</button>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template v-else-if="isSupervisor">
      <div class="leave-supervisor-split">
        <aside class="leave-master card" aria-label="LS employee list">
          <div class="leave-master__head">
            <span class="card-title leave-master__title">LS Employees</span>
            <div class="search-wrap leave-master__search">
              <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input v-model="sidebarSearch" class="form-control" type="search" placeholder="Search by name or NPK…" autocomplete="off" />
            </div>
          </div>
          <div class="leave-master__scroll">
            <div v-if="membersLoading" class="leave-master__loading"><span class="spinner"></span> Loading…</div>
            <template v-else>
              <p v-if="filteredSidebarEmployees.length === 0" class="leave-master__empty text-muted text-sm">
                {{ lsMembers.length === 0 ? 'No LS employees are assigned to your supervision.' : 'No matching employees.' }}
              </p>
              <ul v-else class="leave-master__list" role="listbox" :aria-activedescendant="selectedUserId ? `ls-item-${selectedUserId}` : undefined">
                <li
                  v-for="emp in filteredSidebarEmployees"
                  :id="`ls-item-${emp.user_id}`"
                  :key="emp.user_id"
                  role="option"
                  :aria-selected="selectedUserId == emp.user_id"
                  class="leave-master__item"
                  :class="{ 'leave-master__item--active': selectedUserId == emp.user_id }"
                  @click="selectMember(emp.user_id)"
                >
                  <div class="leave-master__item-name">{{ emp.employee_name }}</div>
                  <div class="leave-master__item-npk" title="NPK">{{ emp.npk || '—' }}</div>
                  <span v-if="pendingCountForUser(emp.user_id) > 0" class="leave-master__pending">{{ pendingCountForUser(emp.user_id) }} pending</span>
                </li>
              </ul>
            </template>
          </div>
        </aside>

        <div class="leave-detail card">
          <div class="leave-detail__head card-header">
            <div class="leave-detail__head-left">
              <span class="card-title">Team Requests</span>
              <template v-if="selectedEmployeeLabel">
                <span class="leave-detail__sep" aria-hidden="true">·</span>
                <span class="leave-detail__selected">{{ selectedEmployeeLabel }}</span>
              </template>
            </div>
          </div>
          <div class="leave-detail__filter-row detail-panel-filters">
            <select v-model="filterRequestType" class="form-control leave-detail__select" @change="onFilterChange">
              <option value="">All Types</option>
              <option value="cuti">Cuti</option>
              <option value="izin">Izin</option>
              <option value="sakit">Sakit</option>
            </select>
            <select v-model="filters.status" class="form-control leave-detail__select" @change="onFilterChange">
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <input v-model="filters.start_date" type="date" class="form-control leave-detail__date" @change="onFilterChange" />
            <input v-model="filters.end_date" type="date" class="form-control leave-detail__date" @change="onFilterChange" />
            <button type="button" class="btn btn-outline btn-sm" @click="clearSupervisorDetailFilters">Reset</button>
          </div>
          <p v-if="supervisorTruncated" class="leave-detail__trunc text-sm text-muted">
            Showing {{ records.length }} most recent requests out of {{ pagination.total }} total — filter by type, status, or date to narrow down.
          </p>
          <div class="leave-detail__body">
            <template v-if="!selectedUserId">
              <div class="empty-state leave-detail__placeholder">
                <div class="empty-state-icon">👈</div>
                <h3>Select an LS employee</h3>
                <p>Use the list on the left to review Cuti, Izin, and Sakit requests.</p>
              </div>
            </template>
            <template v-else>
              <div v-if="loading" class="loading-overlay"><span class="spinner"></span> Loading…</div>
              <div v-else-if="sortedLeavesForSelectedUser.length === 0" class="empty-state leave-detail__placeholder">
                <div class="empty-state-icon">📋</div>
                <h3>No leave requests found for this period</h3>
                <p class="text-muted text-sm">
                  This employee has no Cuti, Izin, or Sakit records matching the current filters.
                </p>
              </div>
              <div v-else class="table-wrapper leave-detail__table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Period</th>
                      <th>Days</th>
                      <th>Remarks</th>
                      <th>Approval Status</th>
                      <th style="min-width:200px;">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="r in sortedLeavesForSelectedUser" :key="r.id">
                      <td><span class="badge badge-type">{{ typeLabel(r.request_type) }}</span></td>
                      <td>
                        <div class="font-bold">{{ fmtRange(r.start_date, r.end_date) }}</div>
                      </td>
                      <td>{{ countDays(r.start_date, r.end_date) }}</td>
                      <td><span class="cell-reason">{{ r.reason || '—' }}</span></td>
                      <td><span class="badge" :class="`badge-${r.status}`">{{ statusLabel(r.status) }}</span></td>
                      <td>
                        <div class="action-btns">
                          <template v-if="r.status === 'pending'">
                            <button class="btn btn-primary btn-sm" :disabled="actionId === r.id" @click="approve(r.id)">Approve</button>
                            <button class="btn btn-danger btn-sm" :disabled="actionId === r.id" @click="openReject(r)">Reject</button>
                          </template>
                          <span v-else class="text-muted text-sm">—</span>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>
          </div>
        </div>
      </div>

      <div v-if="rejectModal.show" class="modal-backdrop" @click.self="rejectModal.show = false">
        <div class="modal" style="max-width:440px;">
          <div class="modal-header">
            <span class="modal-title">Reject Request</span>
            <button type="button" class="modal-close" @click="rejectModal.show = false">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Remarks <span style="color:var(--bc-rejected)">*</span></label>
              <textarea v-model="rejectModal.note" class="form-control" rows="3" placeholder="Provide a reason…" />
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" @click="rejectModal.show = false">Cancel</button>
            <button type="button" class="btn btn-danger" :disabled="!rejectModal.note.trim() || actionId" @click="confirmReject">Confirm</button>
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="stat-grid leave-supervisor-stats">
        <div class="stat-card">
          <div class="stat-card-label">Total</div>
          <div class="stat-card-value">{{ leaveMonthStats.total }}</div>
          <div class="stat-card-sub">{{ leaveMonthStatsLabel }}</div>
        </div>
        <div class="stat-card" style="border-left:4px solid var(--bc-pending);">
          <div class="stat-card-label">Pending</div>
          <div class="stat-card-value" style="color:var(--bc-pending)">{{ leaveMonthStats.pending }}</div>
          <div class="stat-card-sub">Awaiting Review</div>
        </div>
        <div class="stat-card" style="border-left:4px solid var(--bc-approved);">
          <div class="stat-card-label">Approved</div>
          <div class="stat-card-value" style="color:var(--bc-approved)">{{ leaveMonthStats.approved }}</div>
          <div class="stat-card-sub">Processed</div>
        </div>
        <div class="stat-card" style="border-left:4px solid var(--bc-rejected);">
          <div class="stat-card-label">Rejected</div>
          <div class="stat-card-value" style="color:var(--bc-rejected)">{{ leaveMonthStats.rejected }}</div>
          <div class="stat-card-sub">Declined</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">Team Requests — {{ leaveMonthStatsLabel }}</span>
        </div>
        <div class="card-body" style="padding-bottom:0;">
          <div class="filter-bar filter-bar--wrap">
            <label class="overview-filter-label" for="leave-overview-employee">Employee</label>
            <select
              id="leave-overview-employee"
              v-model="overviewEmployeeUserId"
              class="form-control overview-employee-select"
            >
              <option value="">All Employees</option>
              <option
                v-for="e in sortedTeamEmployeeOptions"
                :key="e.user_id"
                :value="String(e.user_id)"
              >
                {{ e.employee_name }} — {{ e.employee_id }}<template v-if="e.npk"> ({{ e.npk }})</template>
              </option>
            </select>
            <button class="btn btn-outline btn-sm" type="button" @click="clearOverviewEmployeeFilter">Reset</button>
          </div>
        </div>
        <div class="overview-body">
          <div v-if="overviewLoading" class="loading-overlay"><span class="spinner"></span> Loading…</div>
          <div v-else class="employee-grid">
            <div v-if="teamEmployees.length === 0" class="empty-state empty-state--pad">
              <div class="empty-state-icon">✅</div>
              <h3>No team members</h3>
              <p>No LS employees are currently assigned to your supervision.</p>
            </div>
            <div v-else-if="displayedTeamEmployees.length === 0" class="empty-state empty-state--pad">
              <div class="empty-state-icon">🔎</div>
              <h3>No cards for this selection</h3>
              <p>Select a different employee or reset the filter.</p>
            </div>
            <button
              v-for="emp in displayedTeamEmployees"
              :key="emp.user_id"
              type="button"
              class="employee-card"
              @click="openLeaveEmployeeSheet(emp)"
            >
              <div class="employee-card__main">
                <div class="font-bold employee-card__name">{{ emp.employee_name }}</div>
                <div class="text-sm text-muted">{{ emp.employee_id }}</div>
                <div v-if="emp.npk" class="text-sm text-muted font-mono">{{ emp.npk }}</div>
              </div>
              <div class="employee-card__counts">
                <span class="mini-pill">Total {{ emp.total }}</span>
                <span v-if="emp.pending > 0" class="mini-pill mini-pill--pending">Pending {{ emp.pending }}</span>
                <span class="mini-pill mini-pill--muted">Approved {{ emp.approved }}</span>
                <span v-if="emp.rejected > 0" class="mini-pill mini-pill--rej">Rejected {{ emp.rejected }}</span>
              </div>
              <div class="employee-card__cta">Review Approvals →</div>
            </button>
          </div>
        </div>
      </div>

      <div v-if="leaveEmployeeSheet.show" class="modal-backdrop sheet-backdrop" @click.self="closeLeaveEmployeeSheet">
        <div class="modal sheet-modal">
          <div class="modal-header">
            <div>
              <span class="modal-title">{{ leaveEmployeeSheet.employee_name }}</span>
              <div class="text-sm text-muted" style="margin-top:4px;">
                {{ leaveEmployeeSheet.employee_id }}<span v-if="leaveEmployeeSheet.npk"> · {{ leaveEmployeeSheet.npk }}</span>
              </div>
            </div>
            <button class="modal-close" @click="closeLeaveEmployeeSheet">✕</button>
          </div>
          <div class="modal-body sheet-body">
            <div class="bulk-toolbar sheet-toolbar">
              <span class="selected-info">{{ sheetSelectedLeaveIds.size }} selected</span>
              <button
                class="btn btn-primary btn-sm"
                type="button"
                :disabled="sheetSelectedLeaveIds.size === 0 || leaveBulkProcessing"
                @click="openLeaveBulkModal"
              >
                Review Approval
              </button>
            </div>
            <div class="filter-bar">
              <select v-model="sheetFilterRequestType" class="form-control" style="max-width:160px;" @change="onSheetFilterChange">
                <option value="">All Types</option>
                <option value="cuti">Cuti</option>
                <option value="izin">Izin</option>
                <option value="sakit">Sakit</option>
              </select>
              <select v-model="sheetFilters.status" class="form-control" style="max-width:160px;" @change="fetchSheetLeaves">
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
              <input v-model="sheetFilters.start_date" type="date" class="form-control" style="max-width:150px;" @change="fetchSheetLeaves" />
              <input v-model="sheetFilters.end_date" type="date" class="form-control" style="max-width:150px;" @change="fetchSheetLeaves" />
              <button class="btn btn-outline btn-sm" @click="resetSheetLeaveFilters">Reset Period</button>
            </div>

            <div class="table-wrapper sheet-table" style="border:none;border-radius:0;margin-top:12px;">
              <div v-if="sheetLoading" class="loading-overlay"><span class="spinner"></span> Loading…</div>
              <table v-else>
                <thead>
                  <tr>
                    <th style="width:42px;">
                      <input
                        type="checkbox"
                        :checked="sheetLeaveAllSelectableChecked"
                        :indeterminate.prop="sheetLeavePartiallyChecked"
                        @change="toggleSheetLeaveSelectAll"
                      />
                    </th>
                    <th>Type</th>
                    <th>Period</th>
                    <th>Days</th>
                    <th>Remarks</th>
                    <th>Approval Status</th>
                    <th style="min-width:200px;">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="sheetRecords.length === 0">
                    <td colspan="7">
                      <div class="empty-state">
                        <div class="empty-state-icon">📋</div>
                        <h3>No data</h3>
                        <p>Adjust the filter or date range.</p>
                      </div>
                    </td>
                  </tr>
                  <tr v-for="r in sheetRecords" :key="r.id">
                    <td>
                      <input
                        type="checkbox"
                        :disabled="r.status !== 'pending'"
                        :checked="sheetSelectedLeaveIds.has(r.id)"
                        @change="toggleSheetLeaveRow(r.id, $event.target.checked)"
                      />
                    </td>
                    <td><span class="badge badge-type">{{ typeLabel(r.request_type) }}</span></td>
                    <td>
                      <div class="font-bold">{{ fmtRange(r.start_date, r.end_date) }}</div>
                    </td>
                    <td>{{ countDays(r.start_date, r.end_date) }}</td>
                    <td><span class="cell-reason">{{ r.reason || '—' }}</span></td>
                    <td><span class="badge" :class="`badge-${r.status}`">{{ statusLabel(r.status) }}</span></td>
                    <td>
                      <div class="action-btns">
                        <template v-if="r.status === 'pending'">
                          <button class="btn btn-primary btn-sm" :disabled="actionId === r.id" @click="approve(r.id)">Approve</button>
                          <button class="btn btn-danger btn-sm" :disabled="actionId === r.id" @click="openReject(r)">Reject</button>
                        </template>
                        <span v-else class="text-muted text-sm">—</span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-if="sheetPagination.total > 0" class="pagination sheet-pag">
              <span class="pagination-info">
                {{ ((sheetPagination.page - 1) * sheetPagination.limit) + 1 }}–{{ Math.min(sheetPagination.page * sheetPagination.limit, sheetPagination.total) }} of {{ sheetPagination.total }}
              </span>
              <button class="btn btn-ghost btn-sm" :disabled="sheetPagination.page <= 1" @click="changeSheetPage(sheetPagination.page - 1)">‹ Prev</button>
              <button class="btn btn-ghost btn-sm" :disabled="sheetPagination.page * sheetPagination.limit >= sheetPagination.total" @click="changeSheetPage(sheetPagination.page + 1)">Next ›</button>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" @click="closeLeaveEmployeeSheet">Close</button>
          </div>
        </div>
      </div>

      <div v-if="leaveBulkModal.show" class="modal-backdrop" @click.self="leaveBulkModal.show = false">
        <div class="modal" style="max-width:440px;">
          <div class="modal-header">
            <span class="modal-title">Request Approval</span>
            <button type="button" class="modal-close" @click="leaveBulkModal.show = false">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Approval Action <span style="color:var(--bc-rejected)">*</span></label>
              <select v-model="leaveBulkModal.action" class="form-control">
                <option value="approve">Approve</option>
                <option value="reject">Reject</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">
                Rejection Remarks
                <span v-if="leaveBulkModal.action === 'reject'" style="color:var(--bc-rejected)">*</span>
              </label>
              <textarea
                v-model="leaveBulkModal.note"
                class="form-control"
                rows="3"
                :placeholder="leaveBulkModal.action === 'reject' ? 'Required for rejection…' : 'Optional'"
              />
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" @click="leaveBulkModal.show = false">Cancel</button>
            <button
              type="button"
              class="btn"
              :class="leaveBulkModal.action === 'approve' ? 'btn-primary' : 'btn-danger'"
              :disabled="leaveBulkProcessing || sheetSelectedLeaveIds.size === 0 || (leaveBulkModal.action === 'reject' && !leaveBulkModal.note.trim())"
              @click="submitLeaveBulkApproval"
            >
              {{ leaveBulkModal.action === 'approve' ? 'Confirm Approval' : 'Confirm Rejection' }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="rejectModal.show" class="modal-backdrop" @click.self="rejectModal.show = false">
        <div class="modal" style="max-width:440px;">
          <div class="modal-header">
            <span class="modal-title">Reject Request</span>
            <button type="button" class="modal-close" @click="rejectModal.show = false">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Remarks <span style="color:var(--bc-rejected)">*</span></label>
              <textarea v-model="rejectModal.note" class="form-control" rows="3" placeholder="Provide a reason…" />
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" @click="rejectModal.show = false">Cancel</button>
            <button type="button" class="btn btn-danger" :disabled="!rejectModal.note.trim() || actionId" @click="confirmReject">Confirm</button>
          </div>
        </div>
      </div>
    </template>

    <!-- LS: Cancel / Withdraw confirmation -->
    <div v-if="lifecycleModal.show" class="modal-backdrop" @click.self="lifecycleModal.show = false">
      <div class="modal" style="max-width:420px;">
        <div class="modal-header">
          <span class="modal-title">
            {{ lifecycleModal.action === 'cancel' ? 'Cancel Leave Request' : 'Withdraw Leave Request' }}
          </span>
          <button type="button" class="modal-close" @click="lifecycleModal.show = false">✕</button>
        </div>
        <div class="modal-body">
          <p class="text-sm" style="margin-bottom:10px;">
            <template v-if="lifecycleModal.action === 'cancel'">
              Mark this <strong>pending</strong> leave request as <strong>Cancelled</strong>?
              It will leave the Supervisor review queue and no longer count toward your recap.
            </template>
            <template v-else>
              Withdraw this <strong>approved</strong> leave?
              The days will stop counting toward Monthly Recap, BAST and other payroll analytics.
            </template>
          </p>
          <p class="text-sm text-muted" v-if="lifecycleModal.label">{{ lifecycleModal.label }}</p>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline" @click="lifecycleModal.show = false">Back</button>
          <button
            type="button"
            class="btn"
            :class="lifecycleModal.action === 'cancel' ? 'btn-danger' : 'btn-primary'"
            :disabled="lifecycleId === lifecycleModal.id"
            @click="confirmLifecycle"
          >
            {{ lifecycleModal.action === 'cancel' ? 'Confirm Cancel' : 'Confirm Withdraw' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue';
import api from '../utils/api';
import { getUser } from '../utils/auth';
import { formatYmdLocal, formatCalendarDateLocale } from '../utils/calendarDate';

const user = getUser();
const isLs = computed(() => user?.role === 'ls');
const isSupervisor = computed(() => user?.role === 'ls_supervisor');

const SUPERVISOR_TEAM_FETCH_LIMIT = 500;

const typeLabel = (t) => ({ cuti: 'Cuti', izin: 'Izin', sakit: 'Sakit' }[t] || t);
const statusLabel = (s) => ({
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  withdrawn: 'Withdrawn',
}[s] || s);

const form = reactive({
  request_type: 'cuti',
  start_date: '',
  end_date: '',
  reason: '',
});
const formSuccess = ref('');
const formError = ref('');
const formWarning = ref('');
const formWarningTitle = ref('');
const submitting = ref(false);
const loading = ref(false);
const records = ref([]);
const pagination = reactive({ total: 0, page: 1, limit: 15 });
const filterStatus = ref('');
const filterRequestType = ref('');
const filters = reactive({ search: '', status: '', start_date: '', end_date: '' });
const rejectModal = reactive({ show: false, id: null, note: '' });
const actionId = ref(null);
const lifecycleId = ref(null);
const lifecycleModal = reactive({ show: false, id: null, action: 'cancel', label: '' });

const sidebarSearch = ref('');
const selectedUserId = ref(null);
const lsMembers = ref([]);
const membersLoading = ref(false);

const filteredSidebarEmployees = computed(() => {
  const q = sidebarSearch.value.trim().toLowerCase();
  const list = lsMembers.value;
  if (!q) return list;
  return list.filter(
    (e) =>
      String(e.employee_name || '').toLowerCase().includes(q) ||
      String(e.npk || '').toLowerCase().includes(q) ||
      String(e.employee_id || '').toLowerCase().includes(q)
  );
});

const leavesForSelectedUser = computed(() => {
  if (selectedUserId.value == null) return [];
  return records.value.filter((r) => r.user_id == selectedUserId.value);
});

const sortedLeavesForSelectedUser = computed(() =>
  leavesForSelectedUser.value
    .slice()
    .sort((a, b) => {
      const cmp = String(b.start_date || '').localeCompare(String(a.start_date || ''));
      if (cmp !== 0) return cmp;
      return (b.id || 0) - (a.id || 0);
    })
);

const selectedEmployeeLabel = computed(() => {
  const emp = lsMembers.value.find((e) => e.user_id == selectedUserId.value);
  if (!emp) return '';
  return `${emp.employee_name} · NPK ${emp.npk || '—'}`;
});

const supervisorTruncated = computed(
  () => isSupervisor.value && pagination.total > records.value.length
);

function pendingCountForUser(userId) {
  return records.value.filter((r) => r.user_id == userId && r.status === 'pending').length;
}

const reasonRequired = computed(() => form.request_type === 'izin' || form.request_type === 'sakit');
const reasonPlaceholder = computed(() => {
  if (form.request_type === 'cuti') return 'Optional — context for the approver…';
  return 'Required (min. 5 characters)…';
});

const dayCount = computed(() => {
  if (!form.start_date || !form.end_date) return null;
  const n = countDays(form.start_date, form.end_date);
  return Number.isFinite(n) ? n : null;
});

const countDays = (start, end) => {
  const a = new Date(`${String(start).slice(0, 10)}T12:00:00`).getTime();
  const b = new Date(`${String(end).slice(0, 10)}T12:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return '—';
  const d = Math.floor((b - a) / 86400000) + 1;
  return d < 1 ? '—' : d;
};

const fmtShort = (d) => formatCalendarDateLocale(d, 'en-ID', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtRange = (s, e) => {
  if (s === e) return fmtShort(s);
  return `${fmtShort(s)} → ${fmtShort(e)}`;
};

const resetFormDates = () => {
  const ymd = formatYmdLocal();
  form.start_date = ymd;
  form.end_date = ymd;
  form.reason = '';
  form.request_type = 'cuti';
};

const onFilterChange = () => {
  pagination.page = 1;
  fetchList();
};

const clearSupervisorDetailFilters = () => {
  filters.status = '';
  filters.start_date = '';
  filters.end_date = '';
  onFilterChange();
};

const fetchList = async () => {
  if (!isLs.value && !isSupervisor.value) return;
  loading.value = true;
  try {
    const params = {
      page: pagination.page,
      limit: pagination.limit,
    };
    if (filterRequestType.value) params.request_type = filterRequestType.value;
    if (isLs.value) {
      if (filterStatus.value) params.status = filterStatus.value;
      const { data } = await api.get('/leaves/my', { params });
      records.value = data.data || [];
      Object.assign(pagination, data.pagination || {});
    } else if (isSupervisor.value) {
      params.page = 1;
      params.limit = SUPERVISOR_TEAM_FETCH_LIMIT;
      if (filters.status) params.status = filters.status;
      const sd = String(filters.start_date || '').slice(0, 10);
      const ed = String(filters.end_date || '').slice(0, 10);
      if (sd) params.start_date = sd;
      if (ed) params.end_date = ed;
      const { data } = await api.get('/leaves/team', { params });
      records.value = data.data || [];
      Object.assign(pagination, data.pagination || {});
    } else {
      if (filters.search.trim()) params.search = filters.search.trim();
      if (filters.status) params.status = filters.status;
      const { data } = await api.get('/leaves/team', { params });
      records.value = data.data || [];
      Object.assign(pagination, data.pagination || {});
    }
  } catch {
    records.value = [];
  } finally {
    loading.value = false;
  }
};

// Supervisor: fetch the full roster of LS employees assigned to this supervisor
// so the Master sidebar lists everyone regardless of whether they have leave
// requests yet (mirrors Overtime + Approval List behavior).
const fetchSupervisorMembers = async () => {
  membersLoading.value = true;
  try {
    const { data } = await api.get('/attendance/team/members');
    const rows = data?.data || [];
    lsMembers.value = rows
      .map((m) => ({
        user_id: m.id,
        employee_name: m.name,
        employee_id: m.employee_id,
        npk: m.npk || null,
      }))
      .sort((a, b) =>
        String(a.employee_name || '').localeCompare(
          String(b.employee_name || ''),
          'id',
          { sensitivity: 'base' }
        )
      );
  } catch {
    lsMembers.value = [];
  } finally {
    membersLoading.value = false;
  }
};

const selectMember = (userId) => {
  selectedUserId.value = userId;
};

const changePage = (p) => {
  pagination.page = p;
  fetchList();
};

const LEAVE_DUP_CODES = new Set(['LEAVE_ACTIVE_EXISTS', 'LEAVE_APPROVED_EXISTS']);

const submitLeave = async () => {
  formSuccess.value = '';
  formError.value = '';
  formWarning.value = '';
  formWarningTitle.value = '';
  submitting.value = true;
  try {
    const startYmd = String(form.start_date || '').slice(0, 10);
    const endYmd = String(form.end_date || '').slice(0, 10);
    const { data } = await api.post('/leaves', {
      request_type: form.request_type,
      start_date: startYmd,
      end_date: endYmd,
      reason: form.reason || null,
    });
    if (data.success) {
      formSuccess.value = data.message || 'Submitted.';
      resetFormDates();
      await fetchList();
    }
  } catch (err) {
    const resp = err.response?.data;
    const msg = resp?.message || 'Submission failed.';
    const code = resp?.code;
    const isDup =
      err.response?.status === 409 &&
      (LEAVE_DUP_CODES.has(code) || /pending|approved/i.test(msg));
    if (isDup) {
      formWarning.value = msg;
      formWarningTitle.value =
        resp?.existing_status === 'pending'
          ? 'Pending request already exists for this date'
          : 'Approved request already exists for this date';
    } else {
      formError.value = msg;
    }
  } finally {
    submitting.value = false;
  }
};

const approve = async (id) => {
  actionId.value = id;
  try {
    await api.put(`/leaves/${id}/approval`, { action: 'approve' });
    if (isLs.value || isSupervisor.value) await fetchList();
    else await refreshSupervisorLeaveData();
  } catch { /* */ } finally {
    actionId.value = null;
  }
};

const openReject = (r) => {
  rejectModal.id = r.id;
  rejectModal.note = '';
  rejectModal.show = true;
};

const confirmReject = async () => {
  if (!rejectModal.note.trim() || !rejectModal.id) return;
  actionId.value = rejectModal.id;
  try {
    await api.put(`/leaves/${rejectModal.id}/approval`, {
      action: 'reject',
      rejection_note: rejectModal.note,
    });
    rejectModal.show = false;
    if (isLs.value || isSupervisor.value) await fetchList();
    else await refreshSupervisorLeaveData();
  } catch { /* */ } finally {
    actionId.value = null;
  }
};

const openLifecycleConfirm = (record, action) => {
  lifecycleModal.id = record.id;
  lifecycleModal.action = action;
  lifecycleModal.label = `${typeLabel(record.request_type)} · ${fmtRange(record.start_date, record.end_date)}`;
  lifecycleModal.show = true;
};

const confirmLifecycle = async () => {
  if (!lifecycleModal.id) return;
  lifecycleId.value = lifecycleModal.id;
  try {
    const { data } = await api.put(
      `/leaves/${lifecycleModal.id}/cancel-withdraw`,
      { action: lifecycleModal.action }
    );
    if (data?.success === false) {
      window.alert(data.message || 'Operation failed.');
    }
    lifecycleModal.show = false;
    await fetchList();
  } catch (err) {
    window.alert(err?.response?.data?.message || 'Operation failed.');
  } finally {
    lifecycleId.value = null;
  }
};

watch(
  [filteredSidebarEmployees, membersLoading],
  () => {
    if (!isSupervisor.value) return;
    if (membersLoading.value) return;
    const list = filteredSidebarEmployees.value;
    if (list.length === 0) {
      selectedUserId.value = null;
      return;
    }
    const stillVisible = list.some((e) => e.user_id == selectedUserId.value);
    if (selectedUserId.value == null || !stillVisible) {
      selectedUserId.value = list[0].user_id;
    }
  },
  { flush: 'post' }
);

onMounted(() => {
  resetFormDates();
  if (isLs.value) {
    fetchList();
  } else if (isSupervisor.value) {
    // Load full team roster first so the sidebar always shows every assigned
    // LS employee, then load their leave records to populate the detail panel.
    fetchSupervisorMembers().then(() => fetchList());
  } else {
    fetchLeaveMonthStats();
    fetchTeamEmployeesOverview();
  }
});
</script>

<style scoped>
.leave-hub { max-width: 1120px; }
.leave-hub--supervisor-split {
  max-width: 1400px;
}
/* LS employee view: use full page width so the request list mirrors AttendanceList */
.leave-hub--single { max-width: none; }

.leave-supervisor-split {
  display: flex;
  align-items: stretch;
  gap: 24px;
  min-height: min(72vh, 800px);
}

.leave-master {
  flex: 0 0 30%;
  width: 30%;
  max-width: 30%;
  min-width: 220px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
  border: 1px solid var(--bc-gray-200);
}

.leave-master__head {
  flex-shrink: 0;
  padding: 14px 14px 12px;
  border-bottom: 1px solid var(--bc-gray-100);
  background: linear-gradient(180deg, #fff 0%, var(--bc-gray-50, #f9fafb) 100%);
}

.leave-master__title {
  display: block;
  margin-bottom: 10px;
  font-size: 15px;
}

.leave-master__search .form-control {
  width: 100%;
  max-width: none;
  border-color: var(--bc-gray-200);
}

.leave-master__search .form-control:focus {
  border-color: var(--bc-green-500);
  box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.12);
}

.leave-master__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
}

.leave-master__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 28px 12px;
  color: var(--bc-gray-600);
  font-size: 14px;
}

.leave-master__empty {
  padding: 16px 10px;
  text-align: center;
}

.leave-master__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.leave-master__item {
  padding: 12px 12px;
  margin-bottom: 6px;
  border-radius: 8px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.leave-master__item:hover {
  background: var(--bc-gray-50, #f9fafb);
  border-color: var(--bc-gray-200);
}

.leave-master__item--active {
  background: #ecfdf5;
  border-color: var(--bc-green-500);
  box-shadow: 0 1px 2px rgba(22, 101, 52, 0.08);
}

.leave-master__item-name {
  font-weight: 700;
  font-size: 14px;
  color: var(--bc-gray-900);
}

.leave-master__item-npk {
  font-size: 12px;
  color: var(--bc-gray-600);
  margin-top: 2px;
  font-family: ui-monospace, 'Cascadia Code', 'Consolas', monospace;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}

.leave-master__pending {
  display: inline-block;
  margin-top: 6px;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  background: #fef3c7;
  color: #92400e;
}

.leave-detail {
  flex: 1 1 70%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
  border: 1px solid var(--bc-gray-200);
}

.leave-detail__head {
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--bc-gray-100);
  background: #fff;
}

.leave-detail__head-left {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.leave-detail__sep {
  color: var(--bc-gray-400);
}

.leave-detail__selected {
  font-size: 14px;
  font-weight: 600;
  color: var(--bc-green-800);
}

.leave-detail__select {
  max-width: 160px;
}

.leave-detail__filter-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 10px 16px 12px;
  border-bottom: 1px solid var(--bc-gray-100);
  background: #fafdfb;
}

.leave-detail__date {
  max-width: 150px;
}

.leave-detail__trunc {
  margin: 0;
  padding: 8px 16px 0;
}

.leave-detail__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 16px 20px;
}

.leave-detail__placeholder {
  padding: 40px 16px;
}

.leave-detail__table-wrap {
  border: 1px solid var(--bc-gray-200);
  border-radius: 8px;
}
.leave-obj-header {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
  position: relative;
}
.leave-obj-header__titles { flex: 1; min-width: 0; }
.leave-accent {
  width: 4px;
  border-radius: 4px;
  flex-shrink: 0;
  align-self: stretch;
  min-height: 48px;
  background: var(--bc-green-500);
}
.leave-hub--single .leave-accent { background: var(--bc-green-600); }

.leave-grid {
  display: grid;
  grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}
.leave-new-card { box-shadow: var(--shadow-sm); }
.leave-list-card { box-shadow: var(--shadow-sm); min-width: 0; }

/* LS list: let Remarks breathe across the full available width */
.leave-ls-table table { table-layout: fixed; }
.leave-ls-table .cell-reason {
  display: -webkit-box;
  max-width: 100%;
  white-space: normal;
  overflow: hidden;
  text-overflow: ellipsis;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-height: 1.4;
}
.toolbar-filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.toolbar-select { max-width: 140px; font-size: 13px; padding: 6px 10px; }

.badge-type {
  background: var(--bc-gray-100);
  color: var(--bc-gray-700);
  font-weight: 600;
  text-transform: none;
}

.cell-reason {
  display: inline-block;
  max-width: 220px;
  font-size: 13px;
  color: var(--bc-gray-600);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

.req { color: var(--bc-rejected); }

.action-btns { display: flex; flex-wrap: wrap; gap: 6px; }
.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.btn-cancel {
  color: var(--bc-rejected);
  border-color: #fecaca;
}
.btn-cancel:hover:not(:disabled) {
  background: #fee2e2;
  border-color: var(--bc-rejected);
}
.btn-withdraw {
  color: #b45309;
  border-color: #fde68a;
}
.btn-withdraw:hover:not(:disabled) {
  background: #fef3c7;
  border-color: #f59e0b;
}

.bulk-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.sheet-toolbar { margin-bottom: 12px; }
.selected-info {
  font-size: 12px;
  font-weight: 600;
  color: var(--bc-gray-600);
  background: var(--bc-gray-100);
  padding: 4px 8px;
  border-radius: 999px;
}

.filter-bar--wrap { flex-wrap: wrap; align-items: center; gap: 10px; }
.overview-filter-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--bc-gray-600);
  margin: 0;
}
.overview-employee-select {
  min-width: 220px;
  max-width: min(420px, 100%);
}

.leave-supervisor-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 20px;
}
@media (max-width: 900px) {
  .leave-supervisor-stats { grid-template-columns: repeat(2, 1fr); }
}

.overview-body { position: relative; min-height: 120px; }
.employee-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
  padding: 16px;
}
.employee-card {
  text-align: left;
  border: 1px solid var(--bc-gray-200);
  border-radius: var(--radius);
  padding: 14px 16px;
  background: var(--bc-white);
  cursor: pointer;
  transition: box-shadow .15s, border-color .15s;
}
.employee-card:hover {
  border-color: var(--bc-green-500);
  box-shadow: var(--shadow-sm);
}
.employee-card__name { font-size: 15px; }
.employee-card__counts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.mini-pill {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--bc-gray-100);
  color: var(--bc-gray-700);
}
.mini-pill--pending { background: #fef3c7; color: #b45309; }
.mini-pill--muted { background: #ecfdf5; color: var(--bc-green-700); }
.mini-pill--rej { background: #fee2e2; color: #b91c1c; }
.employee-card__cta {
  margin-top: 12px;
  font-size: 12px;
  font-weight: 700;
  color: var(--bc-green-600);
}
.empty-state--pad { padding: 32px 16px; }

.sheet-backdrop { align-items: flex-end; justify-content: center; padding: 0; }
@media (min-width: 900px) {
  .sheet-backdrop { align-items: center; padding: 24px; }
}
.sheet-modal {
  width: 100%;
  max-width: 920px;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  margin: 0;
  border-radius: 12px 12px 0 0;
}
@media (min-width: 900px) {
  .sheet-modal { border-radius: 12px; max-height: 90vh; }
}
.sheet-body {
  overflow: auto;
  flex: 1;
  min-height: 0;
}
.sheet-table { border: 1px solid var(--bc-gray-200); border-radius: var(--radius); }
.sheet-pag {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 12px;
  padding-bottom: 4px;
}

@media (max-width: 900px) {
  .leave-grid { grid-template-columns: 1fr; }

  .leave-supervisor-split {
    flex-direction: column;
    min-height: auto;
  }

  .leave-master {
    flex: 0 0 auto;
    width: 100%;
    max-width: none;
    max-height: 280px;
  }
}
</style>
