import React, { useState, useEffect, useContext, createContext } from 'react'
import { act } from 'react-dom/test-utils'
import { render } from '@testing-library/react'
import FullCalendar from '../dist/index.js'
import dayGridPlugin from '@fullcalendar/daygrid'
import listPlugin from '@fullcalendar/list'
import { anyElsIntersect } from './utils.js'

const NOW_DATE = new Date()
const DEFAULT_OPTIONS = {
  plugins: [dayGridPlugin, listPlugin]
}

it('should render without crashing', () => {
  let { container } = render(
    <FullCalendar {...DEFAULT_OPTIONS} />
  )
  expect(getHeaderToolbarEl(container)).toBeTruthy()
})

it('should unmount and destroy', () => {
  let unmountCalled = false

  let { unmount } = render(
    <FullCalendar
      {...DEFAULT_OPTIONS}
      viewWillUnmount={() => {
        unmountCalled = true
      }}
    />
  )

  unmount()
  expect(unmountCalled).toBe(true)
})

it('should have updatable props', () => {
  let { container, rerender } = render(
    <FullCalendar {...DEFAULT_OPTIONS} />
  )
  expect(isWeekendsRendered(container)).toBe(true)

  rerender(
    <FullCalendar {...DEFAULT_OPTIONS} weekends={false} />
  )
  expect(isWeekendsRendered(container)).toBe(false)
})

it('should accept a callback', () => {
  let mountCalled = false

  render(
    <FullCalendar
      {...DEFAULT_OPTIONS}
      viewDidMount={() => {
        mountCalled = true
      }}
    />
  )
  expect(mountCalled).toBe(true)
})

it('should expose an API', function() {
  let componentRef = React.createRef()
  render(
    <FullCalendar {...DEFAULT_OPTIONS} ref={componentRef} />
  )

  let calendarApi = componentRef.current.getApi()
  expect(calendarApi).toBeTruthy()

  let newDate = new Date(Date.UTC(2000, 0, 1))
  calendarApi.gotoDate(newDate)
  expect(calendarApi.getDate().valueOf()).toBe(newDate.valueOf())
})

it('won\'t rerender toolbar if didn\'t change', function() { // works because internal VDOM reuses toolbar element
  let { container, rerender } = render(
    <FullCalendar {...DEFAULT_OPTIONS} headerToolbar={buildToolbar()} />
  )
  let headerEl = getHeaderToolbarEl(container)

  rerender(
    <FullCalendar {...DEFAULT_OPTIONS} headerToolbar={buildToolbar()} />
  )
  expect(getHeaderToolbarEl(container)).toBe(headerEl)
})

it('won\'t rerender events if nothing changed', function() {
  let options = {
    ...DEFAULT_OPTIONS,
    events: [buildEvent()]
  }

  let { container, rerender } = render(
    <FullCalendar {...options} />
  )
  let eventEl = getFirstEventEl(container)

  rerender(
    <FullCalendar {...options} />
  )
  expect(getFirstEventEl(container)).toBe(eventEl)
})

// https://github.com/fullcalendar/fullcalendar-react/issues/185
it('will not inifinitely recurse in strict mode with datesSet', function(done) {
  let calledDone = false

  function TestApp() {
    const [events, setEvents] = useState([
      { title: 'event 1', date: '2022-04-01' },
      { title: 'event 2', date: '2022-04-02' }
    ]);

    const dateChange = () => {
      setEvents([
        { title: 'event 10', date: '2022-04-01' },
        { title: 'event 20', date: '2022-04-02' }
      ]);
    };

    useEffect(() => {
      setTimeout(() => {
        if (!calledDone) {
          calledDone = true
          done()
        }
      }, 100)
    });

    return (
      <FullCalendar
        plugins={[dayGridPlugin]}
        initialView='dayGridMonth'
        events={events}
        datesSet={dateChange}
      />
    );
  }

  render(
    <React.StrictMode>
      <TestApp />
    </React.StrictMode>
  )
})

// https://github.com/fullcalendar/fullcalendar-react/issues/13
it('will not inifinitely recurse with datesSet and dateIncrement', function(done) {
  let calledDone = false

  function TestApp() {
    const [events, setEvents] = useState([
      { title: 'event 1', date: '2022-04-01' },
      { title: 'event 2', date: '2022-04-02' }
    ]);

    const dateChange = () => {
      setEvents([
        { title: 'event 10', date: '2022-04-01' },
        { title: 'event 20', date: '2022-04-02' }
      ]);
    };

    useEffect(() => {
      setTimeout(() => {
        if (!calledDone) {
          calledDone = true
          done()
        }
      }, 100)
    });

    return (
      <FullCalendar
        plugins={[dayGridPlugin]}
        views={{
          rollingSevenDay: {
            type: 'dayGrid',
            duration: { days: 7 },
            dateIncrement: { days: 1 },
          }
        }}
        initialView='rollingSevenDay'
        events={events}
        datesSet={dateChange}
      />
    );
  }

  render(
    <TestApp />
  )
})

it('slot rendering inherits parent context', () => {
  const ThemeColor = createContext('')

  function TestApp() {
    return (
      <ThemeColor.Provider value='red'>
        <Calendar />
      </ThemeColor.Provider>
    )
  }

  function Calendar() {
    const themeColor = useContext(ThemeColor)

    return (
      <FullCalendar
        {...DEFAULT_OPTIONS}
        initialDate='2022-04-01'
        events={[
          { title: 'event 1', date: '2022-04-01' },
        ]}
        eventContent={(arg) => (
          <span style={{ color: themeColor }}>{arg.event.title}</span>
        )}
      />
    )
  }

  let { container } = render(
    <React.StrictMode>
      <TestApp />
    </React.StrictMode>
  )

  let eventEl = getFirstEventEl(container)
  expect(eventEl.querySelector('span').style.color).toBe('red')
})

it('accepts jsx node for slot', () => {
  const { container } = render(
    <FullCalendar
      {...DEFAULT_OPTIONS}
      initialView='listDay'
      noEventsContent={<div className='empty-message'>no events</div>}
    />
  )

  expect(container.querySelectorAll('.empty-message').length).toBe(1)
})

// https://github.com/fullcalendar/fullcalendar/issues/7089
it('does not produce overlapping multiday events with custom eventContent', () => {
  const DATE = '2022-04-01'
  const EVENTS = [
    { title: 'event 1', start: '2022-04-04', end: '2022-04-09' },
    { title: 'event 2', date: '2022-04-05', end: '2022-04-08' }
  ]

  function renderEvent(eventArg) {
    return <i>{eventArg.event.title}</i>
  }

  function TestApp() {
    return (
      <FullCalendar
        plugins={[dayGridPlugin]}
        initialView='dayGridMonth'
        initialDate={DATE}
        initialEvents={EVENTS}
        eventContent={renderEvent}
      />
    );
  }

  const { container } = render(<TestApp />)

  const eventEls = getEventEls(container)
  expect(eventEls.length).toBe(2)
  expect(anyElsIntersect(eventEls)).toBe(false)
})

// https://github.com/fullcalendar/fullcalendar/issues/7119
it('rerenders content-injection with latest render-func closure', (done) => {
  const DATE = '2022-04-01'
  const EVENTS = [
    { title: 'event 1', start: '2022-04-04', end: '2022-04-09' }
  ]

  function TestApp() {
    const [counter, setCounter] = useState(0)

    useEffect(() => {
      setTimeout(() => {
        act(() => {
          setCounter(counter + 1)
        })
      }, 50)
    }, [])

    return (
      <FullCalendar
        plugins={[dayGridPlugin]}
        initialView='dayGridMonth'
        initialDate={DATE}
        initialEvents={EVENTS}
        eventContent={(eventArg) => (
          <i>{eventArg.event.title + ' - ' + counter}</i>
        )}
      />
    );
  }

  const { container } = render(<TestApp />)

  let eventEls = getEventEls(container)
  expect(eventEls.length).toBe(1)
  expect(eventEls[0].querySelector('i').innerText).toBe('event 1 - 0')

  setTimeout(() => { // wait for useEffect timeout
    let newEventEls = getEventEls(container)
    expect(newEventEls.length).toBe(1)
    expect(newEventEls[0]).toBe(eventEls[0])
    expect(newEventEls[0].querySelector('i').innerText).toBe('event 1 - 1')
    done()
  }, 100)
})

// https://github.com/fullcalendar/fullcalendar/issues/7107
it('does not infinite loop on navLinks w/ dayCellContent', () => {
  function CustomDayCellContent() {
    return <div>hello world</div>
  }

  function TestApp() {
    return (
      <FullCalendar
        plugins={[dayGridPlugin]}
        initialView='dayGridWeek'
        navLinks
        dayCellContent={() => <CustomDayCellContent />}
      />
    );
  }

  render(<TestApp />)
})

// https://github.com/fullcalendar/fullcalendar/issues/7116
it('does not infinite loop on certain eventContent', () => {
  const INITIAL_DATE = '2022-12-01'
  const EVENTS = [
    {
      start: '2022-12-31T03:40:00',
      end: '2022-12-31T07:40:00',
      title: 'titme33'
    },
    {
      start: '2022-12-30T23:00:00',
      end: '2022-12-31T00:30:00',
      title: 'titme34'
    },
    {
      start: '2022-12-30T23:00:00',
      end: '2022-12-31T00:30:00',
      title: 'titme35'
    },
    {
      start: '2022-12-30T22:30:00',
      end: '2022-12-31T00:00:00',
      title: 'titme36'
    },
    {
      start: '2022-12-30T22:00:00',
      end: '2022-12-31T07:00:00',
      title: 'titme37'
    },
    {
      start: '2022-12-30T19:20:00',
      end: '2022-12-31T01:10:00',
      title: 'titme38'
    },
    {
      start: '2022-12-30T19:00:00',
      end: '2022-12-30T20:00:00',
      title: 'titme39'
    },
    {
      start: '2022-12-30T18:30:00',
      end: '2022-12-30T19:00:00',
      title: 'titme40'
    }
  ]

  function TestApp() {
    return (
      <FullCalendar
        plugins={[dayGridPlugin]}
        initialDate={INITIAL_DATE}
        initialView='dayGridMonth'
        dayMaxEvents={2}
        events={EVENTS}
        eventContent={(eventArg) => <i>{eventArg.event.title}</i>}
      />
    );
  }

  render(<TestApp />)
})


// FullCalendar data utils
// -------------------------------------------------------------------------------------------------

function buildToolbar() {
  return {
    left: 'prev,next today',
    center: 'title',
    right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek'
  }
}

function buildEvent() {
  return { title: 'event', start: new Date(NOW_DATE.valueOf()) } // consistent datetime
}

// DOM utils
// -------------------------------------------------------------------------------------------------

function getHeaderToolbarEl(container) {
  return container.querySelector('.fc-header-toolbar')
}


function isWeekendsRendered(container) {
  return Boolean(container.querySelector('.fc-day-sat'))
}


function getFirstEventEl(container) {
  return container.querySelector('.fc-event')
}

function getEventEls(container) {
  return [...container.querySelectorAll('.fc-event')]
}
