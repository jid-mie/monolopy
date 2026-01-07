import React from "react"
import {Button} from "react-bootstrap"

class Escape extends React.Component{

  constructor(props){
    super(props)
    this.handleClick = this.handleClick.bind(this)
  }

  handleClick(){
    if (this.props.disabled) {
      return
    }
    this.props.handleClick()
  }

  render(){
    return(
      <div className="leave-jail-div">
        <Button onClick={this.handleClick} disabled={this.props.disabled}>Use GOOJF Card</Button>
      </div>
    )
  }

}

export default Escape
