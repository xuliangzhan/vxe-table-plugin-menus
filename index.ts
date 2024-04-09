import XEUtils from 'xe-utils'
import {
  VXETableCore,
  InterceptorMenuParams,
  MenuFirstOption,
  MenuChildOption,
  MouseCellArea,
  VxeGlobalMenusHandles,
  Table
} from 'vxe-table'

let VXETableInstance: VXETableCore

let handleCopy: (content: string | number) => boolean

function handleFixedColumn (fixed: string) {
  return {
    menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
      const { $table, column } = params
      XEUtils.eachTree([column], column => {
        column.fixed = fixed
      })
      $table.refreshColumn()
    }
  }
}

function getClipboardConfig ($table: Table) {
  if ((VXETableInstance as any).globalStore) {
    return (VXETableInstance as any).globalStore
  }
  // 兼容老版本
  if ((VXETableInstance as any).config) {
    return (VXETableInstance as any).config
  }
  if ($table && $table.$vxe) {
    return $table.$vxe
  }
  return {}
}

function setClipboardConfig ($table: Table, clipObj: {
  text: string
  html: string
}) {
  if ((VXETableInstance as any).globalStore) {
    (VXETableInstance as any).globalStore.clipboard = clipObj
  } else if ($table && $table.$vxe) {
    // 兼容老版本
    $table.$vxe.clipboard = clipObj
  }
}

let copyElem: HTMLTextAreaElement

function handleText (content: string | number) {
  if (!copyElem) {
    copyElem = document.createElement('textarea')
    copyElem.id = '$XECopy'
    const styles = copyElem.style
    styles.width = '48px'
    styles.height = '24px'
    styles.position = 'fixed'
    styles.zIndex = '0'
    styles.left = '-500px'
    styles.top = '-500px'
    document.body.appendChild(copyElem)
  }
  copyElem.value = content === null || content === undefined ? '' : ('' + content)
}

function copyText (content: string | number): boolean {
  let result = false
  try {
    handleText(content)
    copyElem.select()
    copyElem.setSelectionRange(0, copyElem.value.length)
    result = document.execCommand('copy')
    copyElem.blur()
  } catch (e) {}
  return result
}

function handleCopyOrCut (params: VxeGlobalMenusHandles.MenuMethodParams, isCut?: boolean) {
  const { $event, $table, row, column } = params
  if (row && column) {
    let text = ''
    if ($table.mouseConfig && $table.mouseOpts.area) {
      if (isCut) {
        $table.triggerCutCellAreaEvent($event)
      } else {
        $table.triggerCopyCellAreaEvent($event)
      }
      // 兼容老版本
      const { clipboard } = getClipboardConfig($table)
      text = clipboard.text
    } else {
      // 操作内置剪贴板
      text = XEUtils.toValueString(XEUtils.get(row, column.field))
      setClipboardConfig($table, { text, html: '' })
    }
    // 开始复制操作
    if (XEUtils.isFunction(handleCopy)) {
      handleCopy(text)
    } else {
      copyText(text)
    }
  }
}

function checkCellOverlay (params: { $table: Table, [key: string]: any }, cellAreas: MouseCellArea[]) {
  const { $table } = params
  const { visibleData } = $table.getTableData()
  const { visibleColumn } = $table.getTableColumn()
  const indexMaps: { [key: string]: boolean } = {}
  for (let aIndex = 0, areaSize = cellAreas.length; aIndex < areaSize; aIndex++) {
    const areaItem = cellAreas[aIndex]
    const { rows, cols } = areaItem
    for (let rIndex = 0, rowSize = rows.length; rIndex < rowSize; rIndex++) {
      const offsetRow = rows[rIndex]
      const orIndex = visibleData.indexOf(offsetRow)
      for (let cIndex = 0, colSize = cols.length; cIndex < colSize; cIndex++) {
        const offsetColumn = cols[cIndex]
        const ocIndex = visibleColumn.indexOf(offsetColumn)
        const key = orIndex + ':' + ocIndex
        if (indexMaps[key]) {
          return false
        }
        indexMaps[key] = true
      }
    }
  }
  return true
}

function getBeenMerges (params: { $table: Table, [key: string]: any }) {
  const { $table } = params
  const { visibleData } = $table.getTableData()
  const { visibleColumn } = $table.getTableColumn()
  const cellAreas = $table.mouseConfig && $table.mouseOpts.area ? $table.getCellAreas() : []
  const mergeList = $table.getMergeCells()
  return mergeList.filter(({ row: mergeRowIndex, col: mergeColIndex, rowspan: mergeRowspan, colspan: mergeColspan }) => {
    return cellAreas.some(areaItem => {
      const { rows, cols } = areaItem
      const startRowIndex = visibleData.indexOf(rows[0])
      const endRowIndex = visibleData.indexOf(rows[rows.length - 1])
      const startColIndex = visibleColumn.indexOf(cols[0])
      const endColIndex = visibleColumn.indexOf(cols[cols.length - 1])
      return mergeRowIndex >= startRowIndex && mergeRowIndex + mergeRowspan - 1 <= endRowIndex && mergeColIndex >= startColIndex && mergeColIndex + mergeColspan - 1 <= endColIndex
    })
  })
}

function handleClearMergeCells (params: { $table: Table, [key: string]: any }) {
  const { $table } = params
  const beenMerges = getBeenMerges(params)
  if (beenMerges.length) {
    $table.removeMergeCells(beenMerges)
  }
  return beenMerges
}

function abandoned (code: string, newCode: string) {
  console.warn(`The code "${code}" has been scrapped, please use "${newCode}"`)
}

function checkPrivilege (item: MenuFirstOption | MenuChildOption, params: InterceptorMenuParams) {
  const { code } = item
  const { $table, columns, row, column } = params
  const { editConfig, mouseConfig, mouseOpts, fnrOpts } = $table
  switch (code) {
    case 'CLEAR_ALL_SORT': {
      const sortList = $table.getSortColumns()
      item.disabled = !sortList.length
      break
    }
    case 'CLEAR_ALL_FILTER': {
      const filterList = $table.getCheckedFilters()
      item.disabled = !filterList.length
      break
    }
    case 'CLEAR_ALL_MERGE': {
      const mergeCells = $table.getMergeCells()
      const mergeFooterItems = $table.getMergeFooterItems()
      item.disabled = !mergeCells.length && !mergeFooterItems.length
      break
    }
    case 'CLEAR_MERGE_CELL': {
      const beenMerges = getBeenMerges(params)
      item.disabled = !beenMerges.length
      break
    }
    case 'EDIT_ROW': {
      item.disabled = !editConfig || !columns.some((column) => column.editRender)
      break
    }
    case 'EDIT_CELL':
    case 'CLEAR_CELL':
    case 'CLEAR_ROW':
    case 'COPY_CELL':
    case 'CUT_CELL':
    case 'PASTE_CELL':
    case 'MERGE_OR_CLEAR':
    case 'MERGE_CELL':
    case 'REVERT_CELL':
    case 'REVERT_ROW':
    case 'INSERT_AT_ROW':
    case 'INSERT_AT_ACTIVED_ROW':
    case 'DELETE_ROW':
    case 'CLEAR_SORT':
    case 'SORT_ASC':
    case 'SORT_DESC':
    case 'CLEAR_FILTER':
    case 'FILTER_CELL':
    case 'EXPORT_ROW':
    case 'OPEN_FIND':
    case 'OPEN_REPLACE':
    case 'HIDDEN_COLUMN':
    case 'FIXED_LEFT_COLUMN':
    case 'FIXED_RIGHT_COLUMN':
    case 'CLEAR_FIXED_COLUMN': {
      item.disabled = !column
      if (column) {
        const isChildCol = !!column.parentId
        switch (code) {
          case 'CLEAR_SORT': {
            item.disabled = !column.sortable || !column.order
            break
          }
          case 'SORT_ASC':
          case 'SORT_DESC': {
            item.disabled = !column.sortable
            break
          }
          case 'FILTER_CELL':
          case 'CLEAR_FILTER': {
            item.disabled = !column.filters || !column.filters.length
            if (!item.disabled) {
              switch (code) {
                case 'CLEAR_FILTER':
                  item.disabled = !column.filters.some((option) => option.checked)
                  break
              }
            }
            break
          }
          case 'REVERT_CELL': {
            item.disabled = !row || !column.field || !$table.isUpdateByRow(row, column.field)
            break
          }
          case 'REVERT_ROW': {
            item.disabled = !row || !column.field || !$table.isUpdateByRow(row)
            break
          }
          case 'OPEN_FIND': {
            item.disabled = !(fnrOpts && mouseConfig && mouseOpts.area && fnrOpts.isFind)
            break
          }
          case 'OPEN_REPLACE': {
            item.disabled = !(fnrOpts && mouseConfig && mouseOpts.area && fnrOpts.isReplace)
            break
          }
          case 'EDIT_CELL': {
            item.disabled = !editConfig || !column.editRender
            break
          }
          case 'COPY_CELL':
          case 'CUT_CELL':
          case 'PASTE_CELL': {
            const cellAreas = mouseConfig && mouseOpts.area ? $table.getCellAreas() : []
            item.disabled = cellAreas.length > 1
            if (!item.disabled) {
              switch (code) {
                case 'PASTE_CELL': {
                  // 兼容老版本
                  const { clipboard } = getClipboardConfig($table)
                  item.disabled = !clipboard || !clipboard.text
                  break
                }
              }
            }
            break
          }
          case 'MERGE_OR_CLEAR':
          case 'MERGE_CELL': {
            const cellAreas = mouseConfig && mouseOpts.area ? $table.getCellAreas() : []
            item.disabled = !cellAreas.length || (cellAreas.length === 1 && cellAreas[0].rows.length === 1 && cellAreas[0].cols.length === 1) || !checkCellOverlay(params, cellAreas)
            break
          }
          case 'FIXED_LEFT_COLUMN':
            item.disabled = isChildCol || column.fixed === 'left'
            break
          case 'FIXED_RIGHT_COLUMN':
            item.disabled = isChildCol || column.fixed === 'right'
            break
          case 'CLEAR_FIXED_COLUMN':
            item.disabled = isChildCol || !column.fixed
            break
        }
      }
      break
    }
  }
}

function handlePrivilegeEvent (params: InterceptorMenuParams) {
  params.options.forEach((list) => {
    list.forEach((item) => {
      checkPrivilege(item, params)
      if (item.children) {
        item.children.forEach((child) => {
          checkPrivilege(child, params)
        })
      }
    })
  })
  return true
}

interface VXETablePluginMenusOptions {
  copy?: typeof handleCopy;
}

function pluginSetup (options?: VXETablePluginMenusOptions) {
  if (options && options.copy) {
    handleCopy = options.copy
  }
}

/**
 * 基于 vxe-table 表格的扩展插件，提供实用的快捷菜单配置
 */
export const VXETablePluginMenus = {
  config: pluginSetup,
  install (vxetable: VXETableCore, options?: VXETablePluginMenusOptions) {
    VXETableInstance = vxetable
    // 检查版本
    if (!/^(3)\./.test(vxetable.version)) {
      console.error('[vxe-table-plugin-menus 3.x] Version vxe-table 3.x is required')
    }

    pluginSetup(options)
    vxetable.interceptor.add('event.showMenu', handlePrivilegeEvent)
    vxetable.menus.mixin({
      /**
       * 清除单元格数据的值；如果启用 mouse-config.area 功能，则清除区域范围内的单元格数据
       */
      CLEAR_CELL: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $table, row, column } = params
          if (row && column) {
            if ($table.mouseConfig && $table.mouseOpts.area) {
              const cellAreas = $table.getCellAreas()
              if (cellAreas && cellAreas.length) {
                cellAreas.forEach(areaItem => {
                  const { rows, cols } = areaItem
                  cols.forEach(column => {
                    rows.forEach(row => {
                      $table.clearData(row, column.field)
                    })
                  })
                })
              }
            } else {
              $table.clearData(row, column.field)
            }
          }
        }
      },
      /**
       * 清除行数据的值
       */
      CLEAR_ROW: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $table, row } = params
          if (row) {
            $table.clearData(row)
          }
        }
      },
      // 已废弃
      CLEAR_SELECTED_ROW: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          abandoned('CLEAR_SELECTED_ROW', 'CLEAR_CHECKBOX_ROW')
          const { $table } = params
          $table.clearData($table.getCheckboxRecords())
        }
      },
      /**
       * 清除复选框选中行数据的值
       */
      CLEAR_CHECKBOX_ROW: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $table } = params
          $table.clearData($table.getCheckboxRecords())
        }
      },
      /**
       * 清除所有数据的值
       */
      CLEAR_ALL: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $table } = params
          $table.clearData()
        }
      },
      /**
       * 还原单元格数据的值；如果启用 mouse-config.area 功能，则还原区域范围内的单元格数据
       */
      REVERT_CELL: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $table, row, column } = params
          if (row && column) {
            if ($table.mouseConfig && $table.mouseOpts.area) {
              const cellAreas = $table.getCellAreas()
              if (cellAreas && cellAreas.length) {
                cellAreas.forEach(areaItem => {
                  const { rows, cols } = areaItem
                  cols.forEach(column => {
                    rows.forEach(row => {
                      $table.revertData(row, column.field)
                    })
                  })
                })
              }
            } else {
              $table.revertData(row, column.field)
            }
          }
        }
      },
      /**
       * 还原行数据的值
       */
      REVERT_ROW: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $table, row } = params
          if (row) {
            $table.revertData(row)
          }
        }
      },
      // 已废弃
      REVERT_SELECTED_ROW: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          abandoned('REVERT_SELECTED_ROW', 'REVERT_CHECKBOX_ROW')
          const { $table } = params
          $table.revertData($table.getCheckboxRecords())
        }
      },
      /**
       * 还原复选框选中行数据的值
       */
      REVERT_CHECKBOX_ROW: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $table } = params
          $table.revertData($table.getCheckboxRecords())
        }
      },
      /**
       * 还原所有数据的值
       */
      REVERT_ALL: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $table } = params
          $table.revertData()
        }
      },
      /**
       * 复制单元格数据的值；如果启用 mouse-config.area 功能，则复制区域范围内的单元格数据，支持 Excel 和 WPS
       */
      COPY_CELL: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          handleCopyOrCut(params)
        }
      },
      /**
       * 剪贴单元格数据的值；如果启用 mouse-config.area 功能，则剪贴区域范围内的单元格数据，支持 Excel 和 WPS
       */
      CUT_CELL: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          handleCopyOrCut(params, true)
        }
      },
      /**
       * 粘贴从表格中被复制的数据；如果启用 mouse-config.area 功能，则粘贴区域范围内的单元格数据，不支持读取剪贴板
       */
      PASTE_CELL: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $event, $table, row, column } = params
          if ($table.mouseConfig && $table.mouseOpts.area) {
            $table.triggerPasteCellAreaEvent($event)
          } else {
            // 兼容老版本
            const { clipboard } = getClipboardConfig($table)
            // 读取内置剪贴板
            if (clipboard && clipboard.text) {
              XEUtils.set(row, column.field, clipboard.text)
            }
          }
        }
      },
      /**
       * 如果启用 mouse-config.area 功能，如果所选区域内已存在合并单元格，则取消临时合并，否则临时合并
       */
      MERGE_OR_CLEAR: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $event, $table } = params
          const cellAreas = $table.getCellAreas()
          const beenMerges = getBeenMerges(params)
          let status = false
          if (beenMerges.length) {
            $table.removeMergeCells(beenMerges)
          } else {
            status = true
            $table.setMergeCells(
              cellAreas.map(({ rows, cols }) => {
                return {
                  row: rows[0],
                  col: cols[0],
                  rowspan: rows.length,
                  colspan: cols.length
                }
              })
            )
          }
          const targetAreas = cellAreas.map(({ rows, cols }) => ({ rows, cols }))
          $table.emitEvent('cell-area-merge', { status, targetAreas }, $event)
        }
      },
      /**
       * 如果启用 mouse-config.area 功能，临时合并区域范围内的单元格，不管是否存在已合并
       */
      MERGE_CELL: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $event, $table } = params
          const { visibleData } = $table.getTableData()
          const { visibleColumn } = $table.getTableColumn()
          const cellAreas = $table.getCellAreas()
          handleClearMergeCells(params)
          if (cellAreas.some(({ rows, cols }) => rows.length === visibleData.length || cols.length === visibleColumn.length)) {
            if (vxetable.modal) {
              vxetable.modal.message({ content: vxetable.t('vxe.pro.area.mergeErr') as string, status: 'error', id: 'operErr' })
            }
            return
          }
          $table.setMergeCells(
            cellAreas.map(({ rows, cols }) => {
              return {
                row: rows[0],
                col: cols[0],
                rowspan: rows.length,
                colspan: cols.length
              }
            })
          )
          const targetAreas = cellAreas.map(({ rows, cols }) => ({ rows, cols }))
          $table.emitEvent('cell-area-merge', { status: true, targetAreas }, $event)
        }
      },
      /**
       * 如果启用 mouse-config.area 功能，清除区域范围内单元格的临时合并状态
       */
      CLEAR_MERGE_CELL: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $event, $table } = params
          const beenMerges = handleClearMergeCells(params)
          if (beenMerges.length) {
            $table.emitEvent('clear-cell-area-merge', { mergeCells: beenMerges }, $event)
          }
        }
      },
      /**
       * 清除所有单元格及表尾的临时合并状态
       */
      CLEAR_ALL_MERGE: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $event, $table } = params
          const mergeCells = $table.getMergeCells()
          const mergeFooterItems = $table.getMergeFooterItems()
          $table.clearMergeCells()
          $table.clearMergeFooterItems()
          $table.emitEvent('clear-merge', { mergeCells, mergeFooterItems }, $event)
        }
      },
      /**
       * 编辑单元格
       */
      EDIT_CELL: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $table, row, column } = params
          if ($table.setEditCell) {
            $table.setEditCell(row, column)
          } else {
          // 兼容老版本
            $table.setActiveCell(row, column.field)
          }
        }
      },
      /**
       * 编辑行
       */
      EDIT_ROW: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $table, row } = params
          if ($table.setEditRow) {
            $table.setEditRow(row)
          } else {
          // 兼容老版本
            $table.setActiveRow(row)
          }
        }
      },
      /**
       * 插入数据
       */
      INSERT_ROW: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $table, menu } = params
          $table.insert(menu.params)
        }
      },
      /**
       * 插入数据并激活编辑状态
       */
      INSERT_ACTIVED_ROW: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $table, menu, column } = params
          const args: any[] = menu.params || []
          $table.insert(args[0])
            .then(({ row }) => {
              if ($table.setEditCell) {
                $table.setEditCell(row, args[1] || column)
              } else {
              // 兼容老版本
                $table.setActiveCell(row, args[1] || column.field)
              }
            })
        }
      },
      /**
       * 插入数据到指定位置
       */
      INSERT_AT_ROW: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $table, menu, row } = params
          if (row) {
            $table.insertAt(menu.params, row)
          }
        }
      },
      /**
       * 插入数据到指定位置并激活编辑状态
       */
      INSERT_AT_ACTIVED_ROW: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $table, menu, row, column } = params
          if (row) {
            const args: any[] = menu.params || []
            $table.insertAt(args[0], row)
              .then(({ row }) => {
                if ($table.setEditCell) {
                  $table.setEditCell(row, args[1] || column)
                } else {
                // 兼容老版本
                  $table.setActiveCell(row, args[1] || column.field)
                }
              })
          }
        }
      },
      /**
       * 移除行数据
       */
      DELETE_ROW: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $table, row } = params
          if (row) {
            $table.remove(row)
          }
        }
      },
      // 已废弃
      DELETE_SELECTED_ROW: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          abandoned('DELETE_SELECTED_ROW', 'DELETE_CHECKBOX_ROW')
          const { $table } = params
          $table.removeCheckboxRow()
        }
      },
      /**
       * 移除复选框选中行数据
       */
      DELETE_CHECKBOX_ROW: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $table } = params
          $table.removeCheckboxRow()
        }
      },
      /**
       * 移除所有行数据
       */
      DELETE_ALL: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $table } = params
          $table.remove()
        }
      },
      /**
       * 清除所选列排序条件
       */
      CLEAR_SORT: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $event, $table, column } = params
          if (column) {
            $table.triggerSortEvent($event, column, null)
          }
        }
      },
      /**
       * 清除所有排序条件
       */
      CLEAR_ALL_SORT: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $event, $table } = params
          const sortList = $table.getSortColumns()
          if (sortList.length) {
            $table.clearSort()
            $table.emitEvent('clear-sort', { sortList }, $event)
          }
        }
      },
      /**
       * 按所选列的值升序
       */
      SORT_ASC: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $event, $table, column } = params
          if (column) {
            $table.triggerSortEvent($event, column, 'asc')
          }
        }
      },
      /**
       * 按所选列的值倒序
       */
      SORT_DESC: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $event, $table, column } = params
          if (column) {
            $table.triggerSortEvent($event, column, 'desc')
          }
        }
      },
      /**
       * 清除复选框选中列的筛选条件
       */
      CLEAR_FILTER: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $event, $table, column } = params
          if (column) {
            $table.handleClearFilter(column)
            $table.confirmFilterEvent($event)
          }
        }
      },
      /**
       * 清除所有列筛选条件
       */
      CLEAR_ALL_FILTER: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $event, $table } = params
          const filterList = $table.getCheckedFilters()
          if (filterList.length) {
            $table.clearFilter()
            $table.dispatchEvent('clear-filter', { filterList }, $event)
          }
        }
      },
      /**
       * 根据单元格值筛选
       */
      FILTER_CELL: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $table, row, column } = params
          if (row && column) {
            const { property, filters } = column
            if (filters.length) {
              const option = filters[0]
              option.data = XEUtils.get(row, property)
              option.checked = true
              $table.updateData()
            }
          }
        }
      },
      /**
       * 导出行数据
       */
      EXPORT_ROW: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $table, menu, row } = params
          if (row) {
            const opts = { data: [row] }
            $table.exportData(XEUtils.assign(opts, menu.params[0]))
          }
        }
      },
      // 已废弃
      EXPORT_SELECTED_ROW: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          abandoned('EXPORT_SELECTED_ROW', 'EXPORT_CHECKBOX_ROW')
          const { $table, menu } = params
          const opts = { data: $table.getCheckboxRecords() }
          $table.exportData(XEUtils.assign(opts, menu.params[0]))
        }
      },
      /**
       * 导出复选框选中行数据
       */
      EXPORT_CHECKBOX_ROW: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $table, menu } = params
          const opts = { data: $table.getCheckboxRecords() }
          $table.exportData(XEUtils.assign(opts, menu.params[0]))
        }
      },
      /**
       * 导出所有行数据
       */
      EXPORT_ALL: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $table, menu } = params
          $table.exportData(menu.params)
        }
      },
      /**
       * 打印所有行数据
       */
      PRINT_ALL: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $table, menu } = params
          $table.print(menu.params)
        }
      },
      // 已废弃
      PRINT_SELECTED_ROW: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          abandoned('PRINT_SELECTED_ROW', 'PRINT_CHECKBOX_ROW')
          const { $table, menu } = params
          const opts = { data: $table.getCheckboxRecords() }
          $table.print(XEUtils.assign(opts, menu.params))
        }
      },
      /**
       * 打印复选框选中行
       */
      PRINT_CHECKBOX_ROW: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $table, menu } = params
          const opts = { data: $table.getCheckboxRecords() }
          $table.print(XEUtils.assign(opts, menu.params))
        }
      },
      /**
       * 打开查找功能
       */
      OPEN_FIND: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $event, $table } = params
          $table.triggerFNROpenEvent($event, 'find')
        }
      },
      /**
       * 打开替换功能
       */
      OPEN_REPLACE: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $event, $table } = params
          $table.triggerFNROpenEvent($event, 'replace')
        }
      },
      /**
       * 隐藏当前列
       */
      HIDDEN_COLUMN: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $table, column } = params
          if (column) {
            $table.hideColumn(column)
          }
        }
      },
      /**
       * 将列固定到左侧
       */
      FIXED_LEFT_COLUMN: handleFixedColumn('left'),
      /**
       * 将列固定到右侧
       */
      FIXED_RIGHT_COLUMN: handleFixedColumn('right'),
      /**
       * 清除固定列
       */
      CLEAR_FIXED_COLUMN: handleFixedColumn(''),
      /**
       * 重置列的可视状态
       */
      RESET_COLUMN: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $table } = params
          $table.resetColumn({ visible: true, resizable: false })
        }
      },
      /**
       * 重置列宽状态
       */
      RESET_RESIZABLE: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $table } = params
          $table.resetColumn({ visible: false, resizable: true })
        }
      },
      /**
       * 重置列的所有状态
       */
      RESET_ALL: {
        menuMethod (params: VxeGlobalMenusHandles.MenuMethodParams) {
          const { $table } = params
          $table.resetColumn(true)
        }
      }
    })
  }
}

if (typeof window !== 'undefined' && window.VXETable && window.VXETable.use) {
  window.VXETable.use(VXETablePluginMenus)
}

export default VXETablePluginMenus
